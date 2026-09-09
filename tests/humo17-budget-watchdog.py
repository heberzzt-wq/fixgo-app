import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
spec=importlib.util.spec_from_file_location('guardian',Path(__file__).resolve().parents[1]/'scripts/jarvis-humo17-budget-watchdog.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class GuardianTests(unittest.TestCase):
    def test_deadline_and_transient_delete_failure(self):
        with tempfile.TemporaryDirectory() as d:
            clock=[100.0]; calls=[]; attempts=[0]
            def provider(method):
                calls.append(method)
                if method=='GET': return (404,None) if attempts[0]>1 else (200,{'id':'fixture'})
                attempts[0]+=1
                if attempts[0]==1: raise OSError('secret must not appear')
                return 204,None
            result=m.guard('fixture',103,Path(d)/'state.json',provider,now=lambda:clock[0],sleep=lambda n:clock.__setitem__(0,clock[0]+n),monotonic=lambda:clock[0])
            self.assertTrue(result['terminationVerified']);self.assertGreaterEqual(clock[0],103)
            self.assertEqual(calls,['GET','DELETE','DELETE','GET'])
            self.assertNotIn('secret',json.dumps(result))
    def test_failed_identity_never_arms(self):
        with tempfile.TemporaryDirectory() as d:
            calls=[]
            def provider(method):
                calls.append(method);return (200,{'id':'wrong'}) if method=='GET' else (404,None)
            result=m.guard('fixture',time.time()+100,Path(d)/'state.json',provider)
            self.assertFalse(result['remoteBudgetWatchdogVerified']);self.assertEqual(calls,['GET','DELETE'])
    def test_expired_deadline_does_not_restart_budget(self):
        with tempfile.TemporaryDirectory() as d:
            def provider(method):return (200,{'id':'fixture'}) if method=='GET' else (404,None)
            result=m.guard('fixture',1,Path(d)/'state.json',provider,sleep=lambda _:self.fail('expired deadline slept'))
            self.assertTrue(result['terminationVerified'])
    def test_survives_parent_exit(self):
        with tempfile.TemporaryDirectory() as d:
            receipt=Path(d)/'state.json'
            subprocess.run([sys.executable,__file__,'--spawn',str(receipt)],check=True,timeout=5)
            limit=time.monotonic()+6
            while time.monotonic()<limit:
                if receipt.exists() and json.loads(receipt.read_text()).get('terminationVerified'):break
                time.sleep(.1)
            self.assertTrue(json.loads(receipt.read_text())['terminationVerified'])

if __name__=='__main__':
    if '--spawn' in sys.argv:
        subprocess.Popen([sys.executable,__file__,'--orphan',sys.argv[-1]],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    elif '--orphan' in sys.argv:
        m.guard('fixture',time.time()+1,sys.argv[-1],lambda method:(200,{'id':'fixture'}) if method=='GET' else (404,None))
    else: unittest.main()
