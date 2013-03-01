var AWS = require('aws-sdk');
var config = require('./config');
var fs = require('fs');
var ec2build = require('./ec2-build');
var winston = require('winston');
var http = require('http');

winston.setLevels(winston.config.syslog.levels);
var winstonFileParams = {
 filename: 'build-kernel.log',
 level: 'debug'
};
winston.add(winston.transports.File, winstonFileParams);

var userData = fs.readFileSync('./build-kernel.txt', 'ascii').toString('base64');
userData = new Buffer(userData).toString('base64');
winston.debug('userData = ' + userData);

var instanceConfig = {
 'SpotPrice': '0.080000',
 'LaunchSpecification': {
  'ImageId': 'ami-0cdf4965',
  'InstanceType': 'm1.xlarge',
  'UserData': userData
 }
};

// Wait 15 minutes to get an instance
var startupTimeout = setTimeout(onTimeoutError, 15*60*1000);
function onTimeoutError() {
 onError("Timeout");
};

try {
 var instance = ec2build.run(instanceConfig, onRun);
 process.on('SIGINT', onKill);
 instance.on('error', onRunError);
} catch(ex) {
 onError("Error invoking ec2build.run: " + ex);
}

function onRunError(err) {
 onError("Error message from ec2build.run: " + err);
};

function onError(err) {
 winston.error("ERROR!!!");
 winston.error("err = " + err);
 if(startupTimeout) clearTimeout(startupTimeout);
 ec2build.stop(doExit);
};

var address = null;
function onRun(err, data) {
 clearTimeout(startupTimeout);
 winston.info("Build running");
 winston.info("name = " + data.name);
 winston.debug("address = " + data.address);
 winston.debug("data = " + JSON.stringify(data));
 address = data.address;
 if(err) {
  onError("Error passed to onRun: " + err);
 } else {
  // start checking status after a minute
  setTimeout(checkStatus, 60000);
 }
};

var timesChecked = 0;
function checkStatus() {
 var request = http.get("http://" + address, currentStatus);
 request.on('error', statusError);

 // stop it after 15 minutes for now
 timesChecked++;
 winston.debug("timesChecked = " + timesChecked);
 if(timesChecked > 15) {
  ec2build.stop(doExit);
 } else {
  setTimeout(checkStatus, 60000);
 }
};

function currentStatus(response) {
 winston.info("Got response: " + response.statusCode);
 response.on('data', printStatus);
};

function printStatus(data) {
 winston.info(data);
};

function statusError(e) {
 winston.info("Got error: " + e.message);
};

function onKill() {
 onError("Shutting down from SIGINT (Crtl-C)");
};

function doExit() {
 winston.transports.File.flush();
 process.exit();
};
