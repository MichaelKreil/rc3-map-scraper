"use strict"

const fs = require('fs');
const canvas = require('canvas');
const {resolve} = require('path');
const https = require('https');
const URL = require('url');

const cacheDir = resolve(__dirname, 'cache');



let queue = new Queue();
queue.add('https://lobby.maps.at.rc3.world/main.json');

run();

async function run() {
	while (!queue.empty()) {
		let url = queue.next();
		let key = url.replace(/[^a-z0-9_\-]/gi, '_');

		try {
			let data = JSON.parse(await cache(key, () => fetch(url)));

			scanForMapUrls(url, data);

			await generateScreenshot(key, data);
		} catch (e) {
			console.log(e);
		}
	}
}


function Queue() {
	let list = [];
	let set = new Set();

	return { add, empty, next }

	function add(url) {
		let key = url.toLowerCase().replace(/[^a-z0-9]/g,'');
		if (set.has(key)) return false;
		set.add(key);
		list.push(url);
		return true;
	}

	function empty() {
		return list.length === 0
	}

	function next() {
		return list.shift();
	}
}

function fetch(url) {
	console.log('fetch', url);
	return new Promise((resolve, reject) => {
		https.get(url, {timeout:10*1000}, res => {
			let buffers = [];
			res.on('data', chunk => buffers.push(chunk));
			if (res.statusCode !== 200) {
				console.log(url, res.statusCode, res.statusMessage);
				return reject();
			}
			res.on('error', () => reject())
			res.on('end', () => resolve(Buffer.concat(buffers)));
		}).on('error', () => reject())
	})
}

async function cache(key, cb) {
	let filename = resolve(cacheDir, key);
	if (fs.existsSync(filename)) return fs.promises.readFile(filename);
	let result = await cb();
	fs.writeFileSync(filename, result);
	return result;
}

async function generateScreenshot(key, data) {
	console.log(data);
		//let filename = resolve(__dirname, 'screenshots', key);
		process.exit();
}

function scanForMapUrls(baseUrl, data) {
	let mapUrls = [];
	data.layers.forEach(l => {
		if (!l) return;
		if (!l.properties) return;
		l.properties.forEach(p => {
			switch (p.name.toLowerCase()) {
				case 'collide':
				case 'collides':
				case 'collision':
				case 'depth':
				case 'exitlayer':
				case 'getbadge':
				case 'jitsi':
				case 'jitsiinstance':
				case 'jitsiroom':
				case 'jitsiroomvizmain1':
				case 'jitsitrigger':
				case 'loop':
				case 'openaudio':
				case 'openwebsite':
				case 'playaudio':
				case 'playaudioloop':
				case 'silent':
				case 'start':
				case 'startlayer':
				case 'stew.one':
				case 'wilkommen':
				case 'xjitsitrigger':
				case 'xopenwebsitetrigger':

				return;
				case 'exiturl':
				case 'exitsceneurl':
					let url = URL.resolve(baseUrl, p.value);
					url = url.replace(/#.*/,'');
					queue.add(url);
				break;
				default:
					console.log(p);
					throw Error(p.name);
			}
		})
	})
}