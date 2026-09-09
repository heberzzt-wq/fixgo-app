"""Pod-local deadline guardian. No account key is copied from the Windows worker.
Uses the documented Pod-scoped RUNPOD_API_KEY and RUNPOD_POD_ID.
A provider TTL is still required to cover allocation before this process starts.
"""
import argparse
import json
import os
from pathlib import Path
import re
import time
import urllib.request
import urllib.error


def atomic_write(file, value):
    file = Path(file)
    tmp = file.with_suffix('.pending')
    with tmp.open('w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, file)


def self_provider(pod_id, key):
    # Fixed origin and self-only resource: no caller-controlled URL or shell.
    url = 'https://rest.runpod.io/v1/pods/' + pod_id
    def request(method):
        req = urllib.request.Request(url, method=method, headers={'Authorization': 'Bearer ' + key})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.loads(response.read(65536) or b'null')
        except urllib.error.HTTPError as error:
            return error.code, None
    return request


def guard(pod_id, deadline, receipt, provider, now=time.time, sleep=time.sleep, monotonic=time.monotonic):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', pod_id) or not 0 < deadline < float('inf'):
        raise ValueError('WATCHDOG_ID_OR_DEADLINE_INVALID')
    state = {'podId': pod_id, 'pid': os.getpid(), 'deadlineEpochSeconds': deadline,
             'remoteBudgetWatchdogInstalled': True, 'remoteBudgetWatchdogVerified': False,
             'terminationVerified': False}
    atomic_write(receipt, state)
    # A failed identity/credential probe accelerates cleanup, never inference.
    try:
        status, body = provider('GET')
        verified = status == 200 and isinstance(body, dict) and body.get('id') == pod_id
    except Exception:
        verified = False
    if verified:
        state['remoteBudgetWatchdogVerified'] = True
        state['status'] = 'REMOTE_BUDGET_WATCHDOG_ARMED'
        atomic_write(receipt, state)
        mono_deadline = monotonic() + max(0, deadline - now())
        while now() < deadline and monotonic() < mono_deadline:
            sleep(min(1, max(0, deadline-now()), max(0, mono_deadline-monotonic())))
    state['status'] = 'REMOTE_BUDGET_TERMINATION_REQUESTED'
    atomic_write(receipt, state)
    # Retry in the Pod independently of SSH, Node, Windows and GitHub.
    while True:
        try:
            status, _ = provider('DELETE')
            if status == 404:
                state['terminationVerified'] = True
            elif status in (200, 204):
                status, body = provider('GET')
                state['terminationVerified'] = status == 404 or (status == 200 and isinstance(body, dict) and body.get('id') == pod_id and body.get('desiredStatus') == 'TERMINATED')
            if state['terminationVerified']:
                state['status'] = 'REMOTE_BUDGET_TERMINATION_VERIFIED'
                atomic_write(receipt, state)
                return state
            state['lastHttpStatus'] = status
        except Exception:
            state['lastError'] = 'PROVIDER_UNREACHABLE'
        atomic_write(receipt, state)
        sleep(2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--deadline', type=float, required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    pod_id = os.environ.get('RUNPOD_POD_ID', '')
    key = os.environ.get('RUNPOD_API_KEY', '')
    if not key or not pod_id:
        atomic_write(args.receipt, {'remoteBudgetWatchdogInstalled': False, 'remoteBudgetWatchdogVerified': False, 'status': 'POD_SCOPED_CREDENTIAL_MISSING'})
        raise SystemExit(2)
    guard(pod_id, args.deadline, args.receipt, self_provider(pod_id, key))
