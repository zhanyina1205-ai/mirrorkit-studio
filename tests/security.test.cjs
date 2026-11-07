const test=require('node:test'),assert=require('node:assert/strict');
const {checkURL,privateIP}=require('../capture.cjs');
test('block private address ranges',()=>{for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','172.16.0.1','169.254.169.254','::1','fd00::1','::ffff:127.0.0.1'])assert.equal(privateIP(ip),true,ip);for(const ip of ['8.8.8.8','1.1.1.1'])assert.equal(privateIP(ip),false);});
test('reject unsafe and local capture URLs',async()=>{for(const url of ['file:///etc/passwd','http://localhost/','http://127.0.0.1/','http://[::1]/','https://user:pass@example.com'])await assert.rejects(()=>checkURL(url));});
