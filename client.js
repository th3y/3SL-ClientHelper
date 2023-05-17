/*
	#Help https://www.twilio.com/blog/creating-twitch-chat-bots-with-node-js
	#Help https://www.npmjs.com/package/youtube-chat
	#Get your Chat token here: https://twitchapps.com/tmi/
	#Get your LiveId from https://studio.youtube.com/video/xxxxHEREISYOURLIVEIDxxxx/livestreaming
*/
const WebSocket = require('ws');
const http = require("http");
const https = require("https");
const querystring = require('querystring')
const open = require('open');
const url = require('url');

const path = require('path');
const net = require("net");
const tmi = require('tmi.js');
const fs = require('fs');
const ini = require('ini');
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
const { LiveChat } = require("youtube-chat")
const liveChat = new LiveChat({liveId: config.Youtube.LiveId});

let Title_App = "PumpSanity 3SL - Streamer Tool"
let version_tool = "0.3a";

// Title
process.stdout.write(
	String.fromCharCode(27) + "]0;" + Title_App + String.fromCharCode(7)
);

console.clear();
console.log(Title_App + "\n\nVersion: " + version_tool + "\n-------------------------------\n")


user_reqcd = {}
user_effcd = {}
user_emojicd = {}
user_antispam = {}


if (config.Youtube.LiveId !== "0" ){
	liveChat.start();
}

// emojis 
var emojinames = [];
const folderpath = config.Global.GamePath + '\\Reacts';

fs.readdirSync(folderpath).forEach(file => {
	file = file.replace(/\.[^/.]+$/, "")
	//console.log(file);
	file = file.toLowerCase();
	emojinames.push(file);
});
// ---- 

console.log("[INFO] Found " + emojinames.length + " reacts.")

var mod_whitelist = [];
const modfilelist = fs.readFileSync('mod_whitelist.txt', 'utf-8');

modfilelist.split(/\r?\n/).forEach(line =>  {
  if (line)
	mod_whitelist.push(line.toLowerCase());
});

console.log("[INFO] " + mod_whitelist.length + " attacks allowed.\n")

console.log("[INFO] Song Request Cooldown per user: " + config.Global.CooldownSongReqPerUser + " secs.")
console.log("[INFO] Attacks Cooldown per user: " + config.Global.CooldownAttackPerUser + " secs.\n")

const socket = new net.Socket();
let bIsSocketConnected = false;
const curTimeStamp = Date.now();

socket.connect( config.Global.PortTCP , '127.0.0.1', function () {
	console.log("[!] Connected to PumpSanity Game Executable.");
	bIsSocketConnected = true;
});

let bIsOnGamePlay = false;
socket.on("data", function (data) {

	var msg = data.toString('utf8');
	//console.log("[!] Response from PumpSanity: %s", msg);
	
	if ( msg.length > 1 )
	{
		if (msg[0] === '*')
		{
			bIsOnGamePlay = false;
		}
		if (msg[0] === '!')
		{
			bIsOnGamePlay = true;
		}
		
		
		//Response from game about song requests
		if (msg[0] === '@')
		{
			var info = msg.split("\t");
			if (msg[1] === '1')
			{
				var userid = info[2];
				
				user_reqcd.userid = true;

				setTimeout(() => {
					user_reqcd.userid = false;
					console.log(`${userid}request song cooldown finished.`);
				},  config.Global.CooldownSongReqPerUser * 1000  );

			}
		}
		
	}
	
});


socket.on('error', function() {
	console.log('[!] Error connecting to PumpSanity Game executable. Execute the game First and wait for Title Menu.');
	socket.end();
	bIsSocketConnected = false;
});

// ---------------------------- Youtube  -----------------------------

liveChat.on("start", (liveId) => {
  console.log("[!] Youtube Chat viewer started");
})
liveChat.on("chat", (chatItem) => {
	var message = chatItem.message[0].text;
	
	if (message == undefined){
		return;
	}
	// can't confirm this, sorry. timestamp probably is different
	if (curTimeStamp > parseInt(Date.parse(chatItem.timestamp))) {
		return;
	}
	
	if ( message.startsWith('!') ) {
	  processChatRequest( chatItem.author.name, message, chatItem.author.channelId.toString() );
	}
	
	processEmojiRequest( message, chatItem.author.name , chatItem.author.channelId );
	
	//console.log(` user ${chatItem.author.name} - msg ${message} - ${Date.parse(chatItem.timestamp)}`);
})

liveChat.on("error", (err) => {
	console.log(`Youtube`, err)
})
// ------------------------------------------------------------------------


// ---------------------------- Twitch  -----------------------------
const client = new tmi.Client({
  connection: {
	secure: true,
	reconnect: true
  },
  identity: {
	username: config.Twitch.Username,
	password: config.Twitch.OAuth
  },
  channels: [ config.Twitch.ChannelName ]
});

if ( config.Twitch.OAuth !== "oauth:undefined" || config.Twitch.OAuth !== "0" ){
	client.connect().catch(console.error);
}

client.on('message', (channel, tags, message, self) => {
	
	if ( self ) {
		return;
	}
	
	var name = tags['display-name'];
	var userid = tags['user-id'].toString();
	
	if ( message.startsWith('!') ) {
		processChatRequest( name , message, userid );
	}
	
	processEmojiRequest(message, name, userid);
	
	//console.log(`${tags['display-name']} [${tags['user-id']}]: ${message}`);
});
// ------------------------------------------------------------------------

function processEmojiRequest(message, username, userid) {
	
	if ( emojinames.length > 0 && message.length > 0 && !message.startsWith('!') && !user_emojicd.userid )
	{
		var msgarr = message.slice(0).split(' ');
		var emojimsg = msgarr[0].toLowerCase();
		
		if ( emojinames.includes( emojimsg )) {
			
			SendToSocket(`?e\t${emojimsg}\t${username}`);
			
			user_emojicd.userid = true;
			
			setTimeout(() => {
				user_emojicd.userid = false;
			},  1000  );
			
		}
	}
}

function ProcessAttacks(args, userid, username)
{
	if (!bIsOnGamePlay) {
		return;
	}
	
	var msgarr = args.join(' ').toLowerCase();
	var bApplyCD = false;
	if ( msgarr.length > 1)
	{
		var modsbycomma = msgarr.split(',');
		var modsbyspace = msgarr.split(' ');
		
		if ( modsbycomma.length > 1 )
		{
			bValidate = true;
			var newmods = "";
			modsbycomma.forEach((line, idx)=> {
				
				if ( mod_whitelist.includes(line) )
				{
					if (idx < modsbycomma.length - 1)
					{
						newmods += line + ', ';
					}else
					{
						newmods += line;
					}
				}
				else
				{
					console.log(`Found forbidden mod and blocked: ${line}` );
					bValidate = false;
				}
						
			});
			
			if (bValidate)
			{
				bApplyCD = true;
				SendToSocket(`?a\t${username}\t${msgarr}`);
			}
		}
		else
		{
			
			if ( modsbyspace.length > 1 )
			{
				var bValidate = true;
				modsbyspace.forEach((line, idx)=> {
					
					if ( mod_whitelist.includes(line) )
					{
						bValidate = true
					}
					else
					{
						console.log(`Found forbidden mod and blocked: ${line}` );
						bValidate = false;
					}
				});
				
				if (bValidate)
				{
					bApplyCD = true;
					SendToSocket(`?a\t${username}\t${msgarr}`);
				}
			}
			else
			{
				
				if ( mod_whitelist.includes(msgarr) )
				{
					bApplyCD = true;
					SendToSocket(`?a\t${username}\t${msgarr}`);
				}
				else
				{
					console.log(`Found forbidden mod and locked: ${msgarr}` );
				}
				
			}
			
			
		}
		
		if (bApplyCD)
		{
			console.log(`[!] Attack from ${username} : ${msgarr} applied`);
			user_effcd.userid = true;
			
			setTimeout(() => {
				user_effcd.userid = false;
				console.log(`${userid}attack cooldown finished.`);
			},  config.Global.CooldownAttackPerUser * 1000  );
			
		}
	}
}

function processChatRequest(username, message, userid){
	
	if (message == undefined){
		return;
	}
	
	const args = message.slice(1).split(' ');
	const command = args.shift().toLowerCase();
	
	if ( command === 'attack' || command === 'a' ) {
		
		if ( !user_effcd.userid ) {
			
			ProcessAttacks( args, userid, username );
		}
	}
	
	if ( command === 'flash' ) {
		
		if ( !user_effcd.userid && mod_whitelist.includes( command ) ) {
			SendToSocket(`?f\t${username}`);
			user_effcd.userid = true;

			setTimeout(() => {
				user_effcd.userid = false;
				console.log(`${userid}attack cooldown finished.`);
			},  config.Global.CooldownAttackPerUser * 1000  );


		}
	}
	if ( command === 'request' || command === 'r' ) {
		
		if ( !user_reqcd.userid && !user_antispam.userid ) { 
			var msgarr = args.join(' ');
			
			if ( msgarr.length >= 4 ) {
				
				var tmp = msgarr.split(",");
				
				var song = tmp[0];
				var additional = "";
				
				if (tmp.length > 1){
					additional = tmp[1].trim();
				}
				
				SendToSocket(`@${song}\t${username}\t${userid}\t${additional}`);

				// antispam
				user_antispam.userid = true;
				
				setTimeout(() => {
					user_antispam.userid = false;
				}, 2000 );
				
			} else {
				
				//client.say(channel, `@${username}, ${config.Language.CmdReqUse} `);
				
			}
			
			//client.say(channel, `•!r @${username}, ${config.Language.CooldownReq}`);
			
		} else {
			
			console.log(`User ${username} [${userid}] is currently on cooldown from Song Request`)
			
		}
	
	}

	
}


function SendToSocket( str ) {
	
	if (bIsSocketConnected) {
		socket.write(`${str}\0`);
	}
}


// -------------------------- Restream -----------------------------

if (config.Restream.ClientId !== "0") {
	
	const svhost = 'localhost';
	const svport = 51227;
	const randomstate = config.Restream.RandomString + Math.random().toString(36).slice(2);

	const requestListener = function (req, res) {
		res.writeHead(200);
		if (req.method == 'GET') {
			const queryObject = url.parse(req.url,true).query;
			if (queryObject.code !== undefined)
			{
				if (queryObject.state === randomstate)
				{
					//console.log(queryObject.code);
					//console.log(queryObject.state);
					res.end("Code recieved, you can close this tab/window.");
					
					postData = {   //the POST request's body data
						grant_type: 'authorization_code',
						redirect_uri: `http://${svhost}:${svport}`,
						code: queryObject.code
					};
					postBody = querystring.stringify(postData);

					var options = {
					  host: 'api.restream.io',
					  port: 443,
					  path: '/oauth/token',
					  method: 'POST',
					  auth: config.Restream.ClientId + ':' + config.Restream.ClientSecret,
					  headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': postBody.length
					  }
					};

					var postreq = https.request(options, function (res) {
							res.setEncoding('utf8');
							res.on('data', function (chunk) {
								var ret = JSON.parse(chunk);
								console.log('Token recieved: ' + ret.access_token);
								const url = `wss://chat.api.restream.io/ws?accessToken=${ret.access_token}`;
								const connection = new WebSocket(url);

								connection.onmessage = (message) => {
									const action = JSON.parse(message.data);
									
									if (action.action === "event") {
										const payLoad = action.payload.eventPayload;
										var message = payLoad.text;
										var userid = payLoad.author.id;
										var username = payLoad.author.displayName;
										//console.log(payLoad);
										
										if ( message.startsWith('!') ) {
										  processChatRequest( username, message, userid );
										}
										processEmojiRequest( message, username, userid );
										//console.log(`message recieved ${message} from ${username} [${userid}]`);
									}
									if (action.action === "heartbeat") {
										console.log("Heartbeat recieved from Restream chat websocket");
									}
								};

						  });
					});
					postreq.write(postBody);
					postreq.end();
				} else {
					console.log("???");
				}
				
			} else {
				res.end("I didn't get anything");
			}
		}
	  
	};

	const server = http.createServer(requestListener);

	server.listen(svport, svhost, () => {
		console.log(`[ReStream App] Server is running on http://${svhost}:${svport}`);
		const clientid = config.Restream.ClientId;
		open(`https://api.restream.io/login?response_type=code&client_id=${clientid}&redirect_uri=http://${svhost}:${svport}&state=${randomstate}`);
	});

}
//--------------------------------------------------------------------------------------------------------------------

/*
	Hola, este es un mensaje de JNC, los quiero mucho amiguitos, sigan jugando pump it up.
*/