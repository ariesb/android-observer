/**
 * android::observer
 * @ariesbe, 2016
 */
const remote = require('electron').remote;

var is_recording = false,
  is_saving = false,
  devices = {},
  recorder = null,
  resourcePath = '.';

resourcePath = process.resourcesPath + '/app';
resourcePath = ".";

var every = require('every-moment');
var timer = every(5, 'second', function() {
  if (!is_recording) {
    get_devices();
  }
});
get_devices();


function get_devices() {
  console.log('Getting Devices');
  const execFile = require('child_process').execFile;
  const child = execFile(resourcePath + '/adb', ['devices'], (error, stdout, stderr) => {
    if (error) {
      throw error;
    }

    const splitLines = require('split-lines');
    var usb_devices = splitLines(stdout);
    if (usb_devices.length > 3) {
      console.log('Devices are connected.');
      for (var i = 1, len = usb_devices.length - 2; i < len; i++) {
        if (usb_devices[i] !== '') {
          get_device_props(usb_devices[i].split('\t')[0]);
        }
      }
    } else {
      clear_device();
    }

  });
}

function get_device_props(deviceSerial) {
  const execFile = require('child_process').execFile;
  const child = execFile(resourcePath + '/adb', ['-s', deviceSerial, 'shell', 'getprop'], (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    save_device_props(deviceSerial, stdout);
  });
}

function save_device_props(deviceSerial, data) {
  devices[deviceSerial] = {
    manufacturer: '',
    model: '',
    androidVersion: ''
  };
  const splitLines = require('split-lines');
  var getprops = splitLines(data);
  for (var i = 0, len = getprops.length; i < len; i++) {
    if (getprops[i].startsWith('[ro.product.manufacturer]')) {
      // save manufacturer
      devices[deviceSerial].manufacturer = getprops[i].split(':')[1].replace('[', '').replace(']', '').trim();
    }

    if (getprops[i].startsWith('[ro.product.model]')) {
      // save manufacturer
      devices[deviceSerial].model = getprops[i].split(':')[1].replace('[', '').replace(']', '').trim();
    }

    if (getprops[i].startsWith('[ro.build.version.release]')) {
      // save manufacturer
      devices[deviceSerial].androidVersion = getprops[i].split(':')[1].replace('[', '').replace(']', '').trim();
    }
  }

  display_device_info(deviceSerial, devices[deviceSerial]);
}

function clear_device() {
  document.getElementById('dev-serial').innerHTML = 'No connected device.';
  document.getElementById('dev-manufacturer').innerHTML = '';
  document.getElementById('dev-model').innerHTML = '';
  document.getElementById('dev-android-version').innerHTML = '';
  document.getElementById('no-device-connected').style.display = '';
  document.getElementById('main-background').style.display = 'none';
  document.getElementById('device-found').style.display = 'none';
}

function androidn(v) {
  var vnames_upperlimit = {
    '2.1': 'Donut',
    '2.2': 'Eclair',
    '2.3': 'Froyo',
    '3.0': 'Gingerbread',
    '4.0': 'Honeycomb',
    '4.1': 'Ice Cream Sandwich',
    '4.4': 'Jellybean',
    '5.0': 'Kitkat',
    '6.0': 'Lollipop',
    '7.0': 'Marshmallow'
  };
  for (var key in vnames_upperlimit) {
    if (v < key) {
      return vnames_upperlimit[key];
    }
  }

  return 'Unknown';
}

function display_device_info(deviceSerial, deviceInfo) {
  document.getElementById('dev-serial').innerHTML = deviceSerial;
  document.getElementById('dev-manufacturer').innerHTML = deviceInfo.manufacturer;
  document.getElementById('dev-model').innerHTML = deviceInfo.model;
  document.getElementById('dev-android-version').innerHTML = deviceInfo.androidVersion;
  document.getElementById('dev-android-name').innerHTML = androidn(deviceInfo.androidVersion);
  document.getElementById('no-device-connected').style.display = 'none';
  document.getElementById('main-background').style.display = '';
  document.getElementById('device-found').style.display = '';

  if(deviceInfo.androidVersion < "4.4") {
    document.getElementById('rec-video').setAttribute('data-animation', 'disabled');
  } else {
    document.getElementById('rec-video').setAttribute('data-animation', '');
  }
}

function create_new_filename() {
  return ('observer_' + (new Date().getTime()));
}

function record_device_activity(deviceSerial) {
  console.log('Start recording from device.');
  var filename = create_new_filename() + '.mp4';
  document.getElementById('dev-record-file').innerHTML = filename;
  const execFile = require('child_process').execFile;
  is_recording = true;
  recorder = execFile(resourcePath + '/adb', ['-s', deviceSerial, 'shell', 'screenrecord', '--bit-rate', '6000000', '--verbose', '/sdcard/' + filename], (error, stdout, stderr) => {
    if (error) {
      // throw error;
      console.log('Got error', error);
    }
  });
  recorder.on('exit', function(code, signal) {
    console.log('child process terminated due to receipt of signal ' + signal);
    recorder = null;
  });
}

function compress_video(filename, cb) {
  const compress = require('child_process').spawn;

  // 320p ./ffmpeg -i observer_1470043546937.mp4 -codec:v libx264 -profile:v baseline -preset slow -b:v 250k -maxrate 250k -bufsize 500k -vf scale=-1:320 -threads 0 -codec:a libfdk_aac -b:a 96k output.mp4
  // 480p ./ffmpeg -i observer_1470043546937.mp4 -codec:v libx264 -profile:v main -preset slow -b:v 400k -maxrate 400k -bufsize 800k -vf scale=-1:480 -threads 0 -codec:a libfdk_aac -b:a 128k output.mp4

  var vzip = compress('./ffmpeg', ['-i', './' +  filename, '-b', '1000000', './vzip_' + filename]);
  vzip.on('close', (code) => {
    cb();
  });
}

function download_video_asc() {
  const spawn = require('child_process').spawn;
  var filename = document.getElementById('dev-record-file').innerHTML;
  const ls = spawn(resourcePath + '/adb', ['pull', '-p', '/sdcard/' + filename]);

  ls.stderr.on('data', (data) => {
    var percentage = data.toString().trim();
    console.log(percentage, percentage.startsWith('Transferring'));
    if( percentage.startsWith('Transferring') ) {
      percentage = data.toString().split('(')[1].replace('%', '').replace(')', '');
      console.log('stderr: ', percentage);
      document.getElementById('rec-perc').innerHTML = percentage;
    }
  });

  ls.on('close', (code) => {
    console.log('child process exited with code', code);
    setTimeout(function() {
      console.log('Download completed.');
      document.getElementById('rec-video').setAttribute('data-animation', '');
      document.getElementById('rec-perc').innerHTML = '';
      is_recording = is_saving = false;

      delete_remote_recording(document.getElementById('dev-serial').innerHTML);

      compress_video(filename, function(){
        const vidfile = require('child_process').spawn;
        const qt = vidfile('open', ['./vzip_' +  filename]);
      });
    }, 600);
  });
}

function delete_remote_recording(deviceSerial) {
  var filename = document.getElementById('dev-record-file').innerHTML;
  const execFile = require('child_process').execFile;
  var child = execFile(resourcePath + '/adb', ['-s', deviceSerial, 'shell', 'rm', '-f', '/sdcard/' + filename], (error, stdout, stderr) => {
    if (error) {
      console.log('Error removing remote file.');
      throw error;
    }

    console.log('Remove completed.');
  });
}

function stop_recording(deviceSerial) {
  recorder.kill();
  is_recording = false;
  setTimeout(function() {
    download_video_asc();
  }, 2000);
}

var screencap_movie = null, counter = 0;
function record_device_activity_legacy(deviceSerial) {
  var filename = create_new_filename();
  document.getElementById('dev-record-file').innerHTML = filename;
  is_recording = true;
  recorder = {};
  counter = 0;
  screencap_movie = every(2, 'second', function() {
    counter += 1;
    var imagename = filename + '_' + ('00000'+counter).slice(-5) + '.png';
    take_screencap(imagename);
  });
}

function stop_recording_legacy(deviceSerial) {
  recorder = null;
  is_recording = false;
  screencap_movie.stop();
  setTimeout(function() {
    download_video_asc_legacy();
  }, 2000);
}

function download_video_asc_legacy() {
  var filename = document.getElementById('dev-record-file').innerHTML;

  for(var ii = 0; ii < counter; ii++) {
    var percentage = Math.floor((ii / counter) * 100);
    document.getElementById('rec-perc').innerHTML = percentage;
    var imagename = filename + '_' + ('00000'+ii).slice(-5) + '.png';
    pull_screencap(imagename);
  }

  setTimeout(function() {
    console.log('Download completed.');
    document.getElementById('rec-video').setAttribute('data-animation', '');
    document.getElementById('rec-perc').innerHTML = '';
    is_recording = is_saving = false;

    // delete_remote_recording(document.getElementById('dev-serial').innerHTML);

    // const vidfile = require('child_process').spawn;
    // const qt = vidfile('open', ['./' +  filename]);
  }, 600);
}


function take_screencap(filename, cb) {
  const execFile = require('child_process').execFile;
  var capture = execFile(resourcePath + '/adb', ['shell', 'screencap', '/sdcard/' + filename], (error, stdout, stderr) => {
    if (error) {
      console.log('Got error', error);
    }
  });

  capture.on('close', (code) => {
    console.log('Done capturing.');
    cb();
  });
}

function pull_screencap(filename, cb) {
  const execFile = require('child_process').execFile;
  var cap_get = execFile(resourcePath + '/adb', ['pull', '/sdcard/' + filename, './screencaps/' + filename], (error, stdout, stderr) => {
    if (error) {
      console.log('Got error', error);
    }
  });

  cap_get.on('close', (code) => {
    console.log('Done pulling.');
    cb();
  });
}

document.getElementById('rec-video').addEventListener('click', function(event) {
  var andv = document.getElementById('dev-android-version').innerHTML;
  if(andv < "4.4") {
    return;
  }

  if (is_saving) return;

  if (!is_recording && !is_saving) {
    // start recording
    this.setAttribute('data-animation', 'record');
    record_device_activity(document.getElementById('dev-serial').innerHTML);
    is_recording = true;
  } else {
    // start saving
    this.setAttribute('data-animation', 'save');
    document.getElementById('rec-perc').innerHTML = '0';
    is_saving = true;
    stop_recording(document.getElementById('dev-serial').innerHTML);
  }
});

document.getElementById('close-app').addEventListener('click', function(event) {
  var window = remote.getCurrentWindow();
  window.close();
});

document.getElementById('capture-shot').addEventListener('click', function(event) {
  var filename = create_new_filename() + '_cap.png';
  console.log('Screen capturing to ', filename);
  take_screencap(filename, function(){
    console.log('Start to pull data.');
    setTimeout(function() {
      pull_screencap(filename, function(){
        console.log('Pulling screen cap', filename);
        const pictureview = require('child_process').spawn;
        pictureview('open', ['./screencaps/' +  filename]);
      });
    }, 1000);
  });

});
