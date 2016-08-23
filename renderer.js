/**
 * android::observer
 * @ariesbe, 2016
 */
const remote = require('electron').remote;

Element.prototype.hasClassName = function (a) {
    return new RegExp("(?:^|\\s+)" + a + "(?:\\s+|$)").test(this.className);
};

Element.prototype.addClassName = function (a) {
    if (!this.hasClassName(a)) {
        this.className = [this.className, a].join(" ");
    }
};

Element.prototype.removeClassName = function (b) {
    if (this.hasClassName(b)) {
        var a = this.className;
        this.className = a.replace(new RegExp("(?:^|\\s+)" + b + "(?:\\s+|$)", "g"), " ");
    }
};

Element.prototype.toggleClassName = function (a) {
  this[this.hasClassName(a) ? "removeClassName" : "addClassName"](a);
};

Element.prototype.about = function (b) {
  this.toggleClassName('flopped');
  var current = this.getElementsByClassName('nodevice')[0];
  var about = this.getElementsByClassName('about')[0];
  about.style.display = b ? 'block' : 'none';
  current.style.display = b ? 'none' : 'block';
};

var card = document.getElementById('card');
var is_recording = false,
  is_saving = false,
  is_connected = false,
  devices = {},
  recorder = null,
  resourcePath = process.resourcesPath + '/app',
  usersHome = process.env.HOME,
  recordingNotSupported = false;

const adb = process.platform + "/adb";
const ffmpeg = process.platform + '/ffmpeg';

var every = require('every-moment');
var timer = every(5, 'second', function() {
  if (!is_recording) {
    get_devices();
  }
});
get_devices();

require('electron').ipcRenderer.on('check-devices', (event, message) => {
  get_devices();
})

function get_devices() {
  console.log('Getting Devices');
  const execFile = require('child_process').execFile;
  const child = execFile(resourcePath + adb, ['devices'], (error, stdout, stderr) => {
    if (error) {
      return;
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
  const child = execFile(resourcePath + adb, ['-s', deviceSerial, 'shell', 'getprop'], (error, stdout, stderr) => {
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

  if(is_connected) {
    card.toggleClassName('flipped');
  }

  is_connected = false;
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
  document.getElementById('dev-android-version').innerHTML = deviceInfo.androidVersion + '<span id="dev-android-name">' + androidn(deviceInfo.androidVersion) + '</span>';

  if(!is_connected) {
      card.toggleClassName('flipped');
  }

  is_connected = true;

  if (deviceInfo.androidVersion < "4.4") {
    document.getElementById('opt-video').innerHTML = "";
    recordingNotSupported = true;
  } else {
    document.getElementById('opt-video').innerHTML = "Record a Video";
    recordingNotSupported = false;
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
  recorder = execFile(resourcePath + adb, ['-s', deviceSerial, 'shell', 'screenrecord', '--bit-rate', '6000000', '--verbose', '/sdcard/' + filename], (error, stdout, stderr) => {
    if (error) {
      console.log('Got error', error);
    }
  });
  recorder.on('exit', (code, signal) => {
    console.log('child process terminated due to receipt of signal ' + signal);
    recorder = null;
  });
}

function compress_video(filename, cb) {
  document.getElementById('activity').innerHTML = 'Compressing.';
  const compress = require('child_process').spawn;

  // 320p ./ffmpeg -i observer_1470043546937.mp4 -codec:v libx264 -profile:v baseline -preset slow -b:v 250k -maxrate 250k -bufsize 500k -vf scale=-1:320 -threads 0 -codec:a libfdk_aac -b:a 96k output.mp4
  // 480p ./ffmpeg -i observer_1470043546937.mp4 -codec:v libx264 -profile:v main -preset slow -b:v 400k -maxrate 400k -bufsize 800k -vf scale=-1:480 -threads 0 -codec:a libfdk_aac -b:a 128k output.mp4
  // var vzip = compress(resourcePath + ffmpeg, ['-i', './' +  filename, '-b', '1000000', './vzip_' + filename]);
  var vzip = compress(resourcePath + ffmpeg, ['-i', usersHome + '/observer/recordings/' + filename, '-codec:v',
    'libx264', '-profile:v', 'main', '-preset', 'slow', '-b:v', '400k',
    '-maxrate', '400k', '-bufsize', '800k', '-vf', 'scale=-1:480', '-threads', '0',
    '-codec:a', 'libfdk_aac', '-b:a', '128k', usersHome + '/observer/recordings/z_' + filename
  ]);
  vzip.on('close', (code) => {
    cb();
  });
}

function download_video_asc() {
  const spawn = require('child_process').spawn;
  var filename = document.getElementById('dev-record-file').innerHTML;
  const ls = spawn(resourcePath + adb, ['pull', '-p', '/sdcard/' + filename, usersHome + '/observer/recordings/' + filename]);

  ls.stderr.on('data', (data) => {
    var percentage = data.toString().trim();
    console.log(percentage, percentage.startsWith('Transferring'));
    if (percentage.startsWith('Transferring')) {
      percentage = data.toString().split('(')[1].replace('%', '').replace(')', '');
      console.log('stderr: ', percentage);
      document.getElementById('rec-perc').innerHTML = percentage;
    }
  });

  ls.on('close', (code) => {
    console.log('child process exited with code', code);
    setTimeout(() => {
      console.log('Download completed.');
      document.getElementById('rec-perc').innerHTML = '';
      document.getElementById('activity').innerHTML = 'Download complete.';
      is_recording = is_saving = false;

      delete_remote_recording(document.getElementById('dev-serial').innerHTML);

      compress_video(filename, () => {
        document.getElementById('activity').innerHTML = 'Opening video.';
        const {
          shell
        } = require('electron');
        shell.openItem(usersHome + '/observer/recordings/z_' + filename);


        document.getElementById('activity').style.display = 'none';
        document.getElementById('options').style.display = '';
      });
    }, 600);
  });
}

function delete_remote_recording(deviceSerial) {
  var filename = document.getElementById('dev-record-file').innerHTML;
  document.getElementById('activity').innerHTML = 'Cleaning device.';
  const execFile = require('child_process').execFile;
  var child = execFile(resourcePath + adb, ['-s', deviceSerial, 'shell', 'rm', '-f', '/sdcard/' + filename], (error, stdout, stderr) => {
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
  setTimeout(() => {
    download_video_asc();
  }, 2000);
}

function take_screencap(filename, cb) {
  const execFile = require('child_process').execFile;
  var capture = execFile(resourcePath + adb, ['shell', 'screencap', '/sdcard/' + filename], (error, stdout, stderr) => {
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
  var cap_get = execFile(resourcePath + adb, ['pull', '/sdcard/' + filename, usersHome + '/observer/screenshots/' + filename], (error, stdout, stderr) => {
    if (error) {
      console.log('Got error', error);
    }
  });

  cap_get.on('close', (code) => {
    console.log('Done pulling.');
    cb();
  });
}

document.getElementById('opt-snap').addEventListener('click', (event) => {
  document.getElementById('options').style.display = 'none';
  document.getElementById('activity').style.display = '';
  document.getElementById('activity').innerHTML = 'Capturing, Please wait.';

  is_recording = true;
  var filename = create_new_filename() + '_cap.png';
  take_screencap(filename, () => {
    console.log('Start to pull data.');
    document.getElementById('activity').innerHTML = 'Retrieving image.';
    setTimeout(() => {
      pull_screencap(filename, () => {
        console.log('Pulling screen cap', filename);
        document.getElementById('activity').innerHTML = 'Opening screenshot.';
        const {
          shell
        } = require('electron');
        shell.openItem(usersHome + '/observer/screenshots/' + filename);

        document.getElementById('activity').style.display = 'none';
        document.getElementById('options').style.display = '';
        is_recording = false;
      });
    }, 1000);
  });
});

document.getElementById('opt-video').addEventListener('click', (event) => {
  if (recordingNotSupported) return;

  document.getElementById('options').style.display = 'none';
  document.getElementById('activity').style.display = '';
  document.getElementById('activity').innerHTML = '<a class="opt-cta" id="opt-stop-rec">STOP</a><div class="recording">Recording.</div>';

  record_device_activity(document.getElementById('dev-serial').innerHTML);
  is_recording = true;

  document.getElementById('opt-stop-rec').addEventListener('click', (event) => {
    document.getElementById('options').style.display = 'none';
    document.getElementById('activity').style.display = '';
    document.getElementById('activity').innerHTML = 'Saving. <span id="rec-perc">0</span>% done.';

    is_saving = true;
    stop_recording(document.getElementById('dev-serial').innerHTML);
  });
});

document.getElementById('close-app').addEventListener('click', function(event) {
  var window = remote.getCurrentWindow();
  window.close();
});
