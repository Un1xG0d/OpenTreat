const http = require("http");
const https = require('https');
const express = require("express");
const app = express();
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var db = require('./db');
var base64 = require('base-64');
var utf8 = require('utf8');
const server = http.createServer(app);
const io = require("socket.io")(server);
let broadcaster;
const port = process.env.PORT || 4000;
var dispenserURL = "otdsp000.ngrok.io";
var auth = "pi:" + process.env.NGROK_PW;
var bytes = utf8.encode(auth);
var encoded = base64.encode(bytes);
const options = {
  headers: {
    'Authorization' : 'Basic ' + encoded
  }
}

// Configure the local strategy for use by Passport.
//
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which
// will be set at `req.user` in route handlers after authentication.
passport.use(new Strategy(
  function(username, password, cb) {
    db.users.findByUsername(username, function(err, user) {
      if (err) { return cb(err); }
      if (!user) { return cb(null, false); }
      if (user.password != password) { return cb(null, false); }
      return cb(null, user);
    });
  }));


// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  db.users.findById(id, function (err, user) {
    if (err) { return cb(err); }
    cb(null, user);
  });
});

app.set('views', __dirname + '/secureview');
app.set('view engine', 'ejs');

app.use(require('morgan')('combined'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session());

app.get('/login',
  function(req, res){
    res.redirect('index.html');
  });
  
app.post('/login', 
  passport.authenticate('local', { failureRedirect: '/login' }),
  function(req, res) {
    res.render('authed');
  });

app.get('/broadcast',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('broadcast');
    var datetime = new Date();
    console.log("[INFO] Broadcast started at: " + datetime);
  });

app.get('/view',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('view');
    var datetime = new Date();
    console.log("[INFO] Viewer joined at: " + datetime);
  });

app.get('/spin',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    https.get("https://" + dispenserURL + "/spin.php", options, res => {
      let data = [];
      res.on('data', chunk => {
        data.push(chunk);
      });
      res.on('end', () => {
        console.log('[INFO] Treat dropped!');
      });
    }).on('error', err => {
      console.log('Error: ', err.message);
    });
  });

app.get('/start_broadcast',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    https.get("https://" + dispenserURL + "/start_broadcast.php", options, res => {
      let data = [];
      res.on('data', chunk => {
        data.push(chunk);
      });
      res.on('end', () => {
        console.log('[INFO] Video stream restarted!');
      });
    }).on('error', err => {
      console.log('Error: ', err.message);
    });
  });

app.get('/restart',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    https.get("https://" + dispenserURL + "/restart.php", options, res => {
      let data = [];
      res.on('data', chunk => {
        data.push(chunk);
      });
      res.on('end', () => {
        console.log('[INFO] System rebooted!');
      });
    }).on('error', err => {
      console.log('Error: ', err.message);
    });
  });

app.use(express.static(__dirname + "/public"));
app.use('/securescript', require('connect-ensure-login').ensureLoggedIn(), express.static(__dirname + "/securescript"));

io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {
  socket.on("broadcaster", () => {
    broadcaster = socket.id;
    socket.broadcast.emit("broadcaster");
  });
  socket.on("watcher", () => {
    socket.to(broadcaster).emit("watcher", socket.id);
  });
  socket.on("offer", (id, message) => {
    socket.to(id).emit("offer", socket.id, message);
  });
  socket.on("answer", (id, message) => {
    socket.to(id).emit("answer", socket.id, message);
  });
  socket.on("candidate", (id, message) => {
    socket.to(id).emit("candidate", socket.id, message);
  });
  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
});
server.listen(port, () => console.log(`[INFO] Server is running on port ${port}`));
