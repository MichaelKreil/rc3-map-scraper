"use strict"

const fs = require('fs');
const canvas = require('canvas');
const {resolve} = require('path');
const https = require('https');
const child_process = require('child_process');
const URL = require('url');
const {Image, createCanvas} = require('canvas');

const cacheFetch = new Cache(resolve(__dirname, 'cache'));
const imageFetch = new Cache(resolve(__dirname, 'image'));

let queue = new Queue();
queue.add('https://lobby.maps.at.rc3.world/main.json');

run();

async function run() {
	while (!queue.empty()) {
		let url = queue.next();
		if (url.startsWith('https://cert.maps.at.rc3.world')) continue;
		let data = JSON.parse(await fetch(url));

		scanForMapUrls(url, data);
		await generateScreenshot(url, data);
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
	let key = url.replace(/[^a-z0-9_\-]/gi, '_');
	return cacheFetch(key, () => {
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
	})
}

function Cache(dir) {
	fs.mkdirSync(dir, {recursive:true});

	return async function (key, cb) {
		let filename = resolve(dir, key);
		if (fs.existsSync(filename)) return fs.promises.readFile(filename);
		let result = await cb();
		fs.writeFileSync(filename, result);
		return result;
	}
}

async function generateScreenshot(baseUrl, data) {
	let key = baseUrl.replace(/[^a-z0-9_\-]/gi, '_');
	let pngFilename = resolve(__dirname, 'image', key+'.png');

	if (fs.existsSync(pngFilename)) return;

	console.log('generateScreenshot', pngFilename);

	let tiles = [];

	if (data.renderorder !== 'right-down') throw Error();
	if (data.tilewidth !== 32) throw Error();
	if (data.tileheight !== 32) throw Error();
	if (data.type !== 'map') throw Error();

	//console.dir(data, {depth:9});
	for (let tileset of data.tilesets) {
		if (tileset.tileheight !== 32) throw Error();
		if (tileset.tilewidth !== 32) throw Error();
		if (tileset.margin !== 0) throw Error();
		if (tileset.spacing !== 0) throw Error();
		if (!tileset.columns) throw Error();

		

		let url = URL.resolve(baseUrl, tileset.image);
		url = url.replace(/#.*/,'');

		let image = await (new Promise(resolve => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = err => { throw err }
			fetch(url).then(data => img.src = data);
		}))

		for (let i = 0; i < tileset.tilecount; i++) {
			let x = 32*(i % tileset.columns);
			let y = 32*(Math.floor(i/tileset.columns));
			tiles[i+tileset.firstgid] = { image, x, y };
		}
	}

	let layerData = [];
	let visibleLayers = data.layers.filter(l => {
		if (!l.visible) return false;
		if (l.opacity === 0) return false;
		if (l.type === 'objectgroup') return false;

		//console.log(l);

		if (l.type !== 'tilelayer') throw Error();
		if (l.height !== data.height) throw Error();
		if (l.width !== data.width) throw Error();
		if (l.x !== 0) throw Error();
		if (l.y !== 0) throw Error();

		return true;
	})

	let canvas = createCanvas(data.width*32, data.height*32);
	let ctx = canvas.getContext('2d', {alpha: true});
	ctx.clearRect(0, 0, data.width*32, data.height*32)

	for (let y0 = 0; y0 < data.height; y0++) {
		for (let x0 = 0; x0 < data.width; x0++) {
			let index = x0 + y0*data.width;

			visibleLayers.forEach(l => {
				let tileIndex = l.data[index];
				if (!tileIndex) return;
				let tile = tiles[tileIndex];
				if (!tile) return;
				ctx.globalAlpha = l.opacity;
				ctx.drawImage(tile.image, tile.x, tile.y, 32, 32, x0*32, y0*32, 32, 32);
			})
		}
	}

	fs.writeFileSync(pngFilename, canvas.toBuffer('image/png'));

	child_process.execSync('optipng '+pngFilename, {stdio:'ignore'});
	
	return
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