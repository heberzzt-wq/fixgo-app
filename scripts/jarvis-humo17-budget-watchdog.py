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
    transport = ['rest']
    def http(target, method, payload=None):
        req = urllib.request.Request(target, method=method,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={'Authorization': 'Bearer ' + key, 'User-Agent': 'Jarvis-V142-Watchdog/1.0',
                     'Accept': 'application/json', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.loads(response.read(65536) or b'null')
        except urllib.error.HTTPError as error:
            return error.code, None
    def graphql(method):
        query = ('query Self($id:String!){pod(input:{podId:$id}){id desiredStatus}}' if method == 'GET'
                 else 'mutation SelfTerminate($id:String!){podTerminate(input:{podId:$id})}')
        status, body = http('https://api.runpod.io/graphql', 'POST', {'query':query,'variables':{'id':pod_id}})
        if status != 200: return status, None
        if not isinstance(body, dict) or body.get('errors') or not isinstance(body.get('data'), dict): return 403, None
        if method == 'GET':
            if 'pod' not in body['data']: return 502, None
            pod = body['data']['pod']
            return (404, None) if pod is None else (200, pod)
        return (204, None) if 'podTerminate' in body['data'] else (502, None)
    def request(method):
        if method not in ('GET','DELETE'): raise ValueError('SELF_OPERATION_INVALID')
        if transport[0] == 'graphql': return graphql(method)
        result = http(url, method)
        # Pod-scoped credentials may be accepted by the legacy control plane only.
        # Keep the same scoped key and exact Pod identity; never escalate credentials.
        if method == 'GET' and result[0] in (401,403):
            alternative = graphql('GET')
            if alternative[0] == 200 and alternative[1].get('id') == pod_id:
                transport[0] = 'graphql'
                request.mechanism = 'pod_scoped_graphql_self_delete'
                return alternative
        return result
    request.mechanism = 'pod_scoped_rest_self_delete'
    return request


def guard(pod_id, deadline, receipt, provider, now=time.time, sleep=time.sleep, monotonic=time.monotonic):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', pod_id) or not 0 < deadline < float('inf'):
        raise ValueError('WATCHDOG_ID_OR_DEADLINE_INVALID')
    state = {'podId': pod_id, 'pid': os.getpid(), 'deadlineEpochSeconds': deadline,
             'remoteBudgetWatchdogInstalled': True, 'remoteBudgetWatchdogVerified': False,
             'terminationVerified': False, 'hostIndependent': True,
             'mechanism': 'pod_scoped_rest_self_delete', 'inferenceStarted': False,
             'remoteWatchdogTriggered': False, 'localWatchdogTriggered': False}
    atomic_write(receipt, state)
    # A failed identity/credential probe accelerates cleanup, never inference.
    try:
        status, body = provider('GET')
        verified = status == 200 and isinstance(body, dict) and body.get('id') == pod_id
    except Exception:
        verified = False
    if verified:
        state['mechanism'] = getattr(provider, 'mechanism', state['mechanism'])
        state['remoteBudgetWatchdogVerified'] = True
        state['armedAtEpochSeconds'] = now()
        state['maximumRuntimeSeconds'] = max(0, deadline-now())
        state['status'] = 'REMOTE_BUDGET_WATCHDOG_ARMED'
        atomic_write(receipt, state)
        mono_deadline = monotonic() + max(0, deadline - now())
        while now() < deadline and monotonic() < mono_deadline:
            sleep(min(1, max(0, deadline-now()), max(0, mono_deadline-monotonic())))
    state['status'] = 'REMOTE_BUDGET_TERMINATION_REQUESTED'
    state['remoteWatchdogTriggered'] = True
    state['terminationRequestedAtEpochSeconds'] = now()
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
