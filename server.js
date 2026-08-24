const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const incidents = new Map();

function cleanCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function deviceList(room) {
  return [...room.clients.values()].map(c => ({
    deviceId: c.deviceId,
    role: c.role,
    displayName: c.displayName
  }));
}
function broadcast(room, data, except=null) {
  const msg = JSON.stringify(data);
  for (const client of room.clients.values()) {
    if (client.ws !== except && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}
function sendDevices(room) {
  broadcast(room, {type:"devices", devices:deviceList(room)});
}

const server = http.createServer((req,res) => {
  if (req.url === "/" || req.url === "/index.html") {
    fs.readFile(path.join(__dirname,"public","index.html"), (err,data)=>{
      if(err){res.writeHead(500);return res.end("Missing public/index.html");}
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
      res.end(data);
    });
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200,{"Content-Type":"application/json"});
    return res.end(JSON.stringify({ok:true, incidents:incidents.size}));
  }
  res.writeHead(404); res.end("Not found");
});

const wss = new WebSocket.Server({server});

wss.on("connection", ws => {
  let currentCode=null, currentDeviceId=null;

  ws.on("message", raw => {
    let msg; try{msg=JSON.parse(raw.toString())}catch(e){return;}
    const type=msg.type;

    if(type==="create"){
      const code=cleanCode(msg.code);
      if(code.length!==6) return ws.send(JSON.stringify({type:"error",message:"Invalid incident code"}));
      if(incidents.has(code)) return ws.send(JSON.stringify({type:"error",message:"Incident code already exists. Try again."}));
      const room={state:msg.state||{},clients:new Map(),createdAt:Date.now()};
      incidents.set(code,room);
      currentCode=code; currentDeviceId=String(msg.deviceId||Date.now());
      room.clients.set(currentDeviceId,{ws,deviceId:currentDeviceId,role:msg.role||"Command",displayName:msg.displayName||"Command"});
      ws.send(JSON.stringify({type:"joined",code,state:room.state,devices:deviceList(room)}));
      sendDevices(room);
      return;
    }

    if(type==="join"){
      const code=cleanCode(msg.code);
      const room=incidents.get(code);
      if(!room) return ws.send(JSON.stringify({type:"error",message:"Incident not found"}));
      currentCode=code; currentDeviceId=String(msg.deviceId||Date.now());
      room.clients.set(currentDeviceId,{ws,deviceId:currentDeviceId,role:msg.role||"Observer",displayName:msg.displayName||msg.role||"Observer"});
      ws.send(JSON.stringify({type:"joined",code,state:room.state,devices:deviceList(room)}));
      sendDevices(room);
      return;
    }

    if(type==="state"){
      const code=cleanCode(msg.code||currentCode);
      const room=incidents.get(code);
      if(!room) return;
      room.state=msg.state||room.state;
      broadcast(room,{
        type:"state",
        state:room.state,
        fromDeviceId:msg.deviceId,
        fromDisplayName:msg.displayName,
        role:msg.role
      },ws);
      return;
    }

    if(type==="leave"){
      try{ws.close()}catch(e){}
    }
  });

  ws.on("close",()=>{
    if(!currentCode)return;
    const room=incidents.get(currentCode);
    if(!room)return;
    room.clients.delete(currentDeviceId);
    sendDevices(room);
    // Keep incident state in memory for reconnects. Empty rooms expire after 12 hours.
  });
});

setInterval(()=>{
  const cutoff=Date.now()-12*60*60*1000;
  for(const [code,room] of incidents){
    if(room.clients.size===0 && room.createdAt<cutoff) incidents.delete(code);
  }
},60*60*1000);

server.listen(PORT,()=>console.log(`Command Board sync server running on port ${PORT}`));
