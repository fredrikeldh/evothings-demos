
var app = {};

// Keep state of both buttons.
app.buttonA = 0;
app.buttonB = 0;

/**
 * Timeout (ms) after which a message is shown if the micro:bit wasn't found.
 */
app.CONNECT_TIMEOUT = 3000;

/**
 * Object that holds micro:bit UUIDs.
 */
app.microbit = {};

app.microbit.ACCELEROMETER_SERVICE = 'e95d0753-251d-470a-a062-fa1922dfa9a8';
app.microbit.ACCELEROMETER_DATA = 'e95dca4b-251d-470a-a062-fa1922dfa9a8';
app.microbit.BUTTON_SERVICE = 'e95d9882-251d-470a-a062-fa1922dfa9a8';
app.microbit.BUTTON_A = 'e95dda90-251d-470a-a062-fa1922dfa9a8';
app.microbit.BUTTON_B = 'e95dda91-251d-470a-a062-fa1922dfa9a8';

var BLE_NOTIFICATION_UUID = '00002902-0000-1000-8000-00805f9b34fb';

app.initialize = function() {
	document.addEventListener(
		'deviceready',
		function() { evothings.scriptsLoaded(app.onDeviceReady) },
		false);
}

// Called when device plugin functions are ready for use.
app.onDeviceReady =  function() {
	app.connect();
}

app.showStatus = function(status) {
	if(app.status != status) {
		console.log("Status: "+status);
		app.status = status;
	}
	document.getElementById('Status').innerHTML = status;
}

app.connect = function() {
	app.disconnect();
	app.startScan();
	app.startConnectTimer();
	app.showStatus('Scanning...');
}

app.disconnect = function() {
	// Stop any ongoing scan and close devices.
	app.stopConnectTimer();
	evothings.easyble.stopScan();
	evothings.easyble.closeConnectedDevices();
	app.showStatus('Disconnected');
}

app.startConnectTimer = function() {
	// If connection is not made within the timeout
	// period, an error message is shown.
	app.connectTimer = setTimeout(
		function()
		{
			app.showStatus('Scanning... Please start the micro:bit.');
		},
		app.CONNECT_TIMEOUT);
}

app.stopConnectTimer = function() {
	clearTimeout(app.connectTimer);
}

app.startScan = function() {
	evothings.easyble.startScan(
		function(device)
		{
			// Connect if we have found an micro:bit.
			if (app.deviceIsMicrobit(device))
			{
				app.showStatus('Device found: ' + device.name + '.');
				evothings.easyble.stopScan();
				app.connectToDevice(device);
				app.stopConnectTimer();
			}
		},
		function(errorCode)
		{
			app.showStatus('Error: startScan: ' + errorCode + '.');
		});
};

app.deviceIsMicrobit = function(device) {
	console.log('device name: ' + device.name);
	return (device != null) &&
		(device.name != null) &&
		((device.name.indexOf('MicroBit') > -1) ||
			(device.name.indexOf('micro:bit') > -1));
};

/**
 * Read services for a device.
 */
app.connectToDevice = function(device) {
	app.showStatus('Connecting...');
	device.connect(
		function(device)
		{
			app.showStatus('Connected - reading micro:bit services...');
			app.readServices(device);
		},
		function(errorCode)
		{
			app.showStatus('Error: Connection failed: ' + errorCode + '.');
			evothings.ble.reset();
			// This can cause an infinite loop...
			//app.connectToDevice(device);
		});
};

app.readServices = function(device) {
	device.readServices(
		[
		app.microbit.ACCELEROMETER_SERVICE,
		app.microbit.BUTTON_SERVICE,
		],
		// Function that monitors accelerometer data.
		app.startAccelerometerNotification,
		// Use this function to monitor magnetometer data
		// (comment out the above line if you try this).
		//app.startMagnetometerNotification,
		function(errorCode)
		{
			app.showStatus('Error: Failed to read services: ' + errorCode + '.');
		});
};

app.writeNotificationDescriptor = function(device, characteristicUUID) {
	device.writeDescriptor(
		characteristicUUID,
		BLE_NOTIFICATION_UUID,
		new Uint8Array([1,0]),
		function()
		{
			console.log('writeDescriptor '+characteristicUUID+' ok.');
		},
		function(errorCode)
		{
			// This error will happen on iOS, since this descriptor is not
			// listed when requesting descriptors. On iOS you are not allowed
			// to use the configuration descriptor explicitly. It should be
			// safe to ignore this error.
			console.log('Error: writeDescriptor: ' + errorCode + '.');
		});
}

/**
 * Read accelerometer data.
 * FirmwareManualBaseBoard-v1.5.x.pdf
 */
app.startAccelerometerNotification = function(device) {
	app.showStatus('Starting accelerometer notification...');

	// Set notifications to ON.
	app.writeNotificationDescriptor(device, app.microbit.ACCELEROMETER_DATA);
	app.writeNotificationDescriptor(device, app.microbit.BUTTON_A);
	app.writeNotificationDescriptor(device, app.microbit.BUTTON_B);

	// Start accelerometer notification.
	device.enableNotification(
		app.microbit.ACCELEROMETER_DATA,
		app.handleAccelerometerValues,
		function(errorCode)
		{
			app.showStatus('Error: enableNotification: ' + errorCode + '.');
		});

	// Start magnetometer bearing notification.
	device.enableNotification(
		app.microbit.BUTTON_A,
		app.handleButtonA,
		function(errorCode)
		{
			console.log('Error: enableNotification: ' + errorCode + '.');
		});

	// Start magnetometer bearing notification.
	device.enableNotification(
		app.microbit.BUTTON_B,
		app.handleButtonB,
		function(errorCode)
		{
			console.log('Error: enableNotification: ' + errorCode + '.');
		});
};

app.handleAccelerometerValues = function(data) {
	app.showStatus('Active');
	var values = app.parseAccelerometerValues(new Uint8Array(data));
	//app.value('Accelerometer', values.x+', '+values.y+', '+values.z);
	lander.setRotation(values.x * -180)
}

/**
 * Calculate accelerometer values from raw data for micro:bit.
 * @param data - an Uint8Array.
 * @return Object with fields: x, y, z.
 */
app.parseAccelerometerValues = function(data) {
	// We want to scale the values to +/- 1.
	// Documentation says: "Values are in the range +/-1000 milli-newtons, little-endian."
	// Actual maximum values is measured to be 2048.
	var divisor = 2048;

	// Calculate accelerometer values.
	var rawX = evothings.util.littleEndianToInt16(data, 0);
	var rawY = evothings.util.littleEndianToInt16(data, 2);
	var rawZ = evothings.util.littleEndianToInt16(data, 4);
	var ax = rawX / divisor;
	var ay = rawY / divisor;
	var az = rawZ / divisor;

	// log raw values every now and then
	var now = new Date().getTime();	// current time in milliseconds since 1970.
	if(!app.lastLog || now > app.lastLog + 500) {
		//console.log([rawX, rawY, rawZ]);
		//console.log(evothings.util.typedArrayToHexString(data));
		//console.log([ax, ay, az]);
		app.lastLog = now;
	}

	// Return result.
	return { x: ax, y: ay, z: az };
};

// Either button will fire the thruster.
app.handleButtonA = function(data) {
	app.buttonA = new Uint8Array(data)[0];
	app.handleButtons();
}

app.handleButtonB = function(data) {
	app.buttonB = new Uint8Array(data)[0];
	app.handleButtons();
}

app.handleButtons = function() {
	var eitherButtonPressed = (app.buttonA != 0 || app.buttonB != 0);
	if(gameState == PLAYING) {
		if(eitherButtonPressed) {
			lander.thrust(1);
		} else {
			lander.thrust(0);
		}
	} else if(!eitherButtonPressed) {
		newGame();
	}
}


/*
app.handleInputLine = function(inputLine)
{
	var opcode = inputLine.charAt(0)
	if(opcode == 'A') {
		var value = inputLine.slice(1)

		// Display value in input field.
		document.getElementById('ArduinoStatus').innerHTML = 'Analog value is: ' + value

		// clamp to -90 < x < 90.
		lander.setRotation((value / 1023.0) * 180 - 90)
	}
	else if(opcode == 'D')
	{
		var value = inputLine.slice(1)
		//$('#DigitalStatus').html(value)
		if(gameState == PLAYING) {
			if(value == '0') {
				lander.thrust(1);
			} else if(value == '1') {
				lander.thrust(0);
			}
		} else if(value == '0') {
			newGame();
		}
	}
	else
	{
		console.log("Unknown input: "+evothings.util.typedArrayToHexString(app.stringToBuffer(inputLine)))
	}
}

app.bufferToString = function(buffer)
{
	return String.fromCharCode.apply(null, new Uint8Array(buffer))
}

app.stringToBuffer = function(string)
{
	var buffer = new ArrayBuffer(string.length)
	var bufferView = new Uint8Array(buffer);
	for (var i = 0; i < string.length; ++i)
	{
		bufferView[i] = string.charCodeAt(i) //string[i]
	}
	return buffer
}
*/

app.initialize();
