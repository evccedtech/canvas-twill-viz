const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const lti = require('ims-lti');
const mongoose = require('mongoose');
const path = require('path');
const simpleOauth2 = require('simple-oauth2');

// MongoDB setup
const mongoDB = process.env.MONGO_URL;

mongoose.connect(mongoDB, { useNewUrlParser: true })

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error.'));

const Schema = mongoose.Schema;

const UserSchema = new Schema({
    user_id: { type: Number, required: true},
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    expires_at: {type: String, required: true }
});

const User = mongoose.model('User', UserSchema);

// Temporary storage for LTI info
let ltiDetails = null;

// Temporary storage for token
let myToken;

// OAuth2 setup
const oauth2 = simpleOauth2.create({
    client: {
        id: process.env.CLIENT_ID,
        secret: process.env.CLIENT_SECRET
    }, 
    auth: {
        authorizePath: process.env.AUTHORIZE_PATH,
        tokenHost: process.env.TOKEN_HOST,
        tokenPath: process.env.TOKEN_PATH
    }
});

// OAuth authorization URI
const authUri = oauth2.authorizationCode.authorizeURL({
    redirect_uri: process.env.REDIRECT_URI
});

const twillRouter = require('./routes/twillRouter');

const app = express();

// Required for Heroku deployment -- otherwise will use http rather than https?
app.enable('trust proxy');

// View engine 
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// LTI launch
app.post('/lti_launch', function(req, res, next) {
    
    let ltiKey = process.env.LTI_KEY;
    let ltiSecret = process.env.LTI_SECRET;
    
    
    ltiDetails = null;
    
    // LTI key match
    if (req.body['oauth_consumer_key'] === ltiKey) {
        
        let provider = new lti.Provider(ltiKey, ltiSecret);
        
        // Check request validity
        provider.valid_request(req, function(err, isValid) {
            
            if (err) {
                res.status(403).send(err);
            } else {
                
                // Invalid LTI launch
                if (!isValid) {
                    res.status(500).send({ error: 'Invalid LTI launch request.' });
                }
                
                // Valid LTI launch
                else {
                    
                    // Store LTI details for later use
                    ltiDetails = {
                        canvas_instance: req.body.custom_canvas_api_domain,
                        course_id: req.body.custom_canvas_course_id,
                        user_id: req.body.custom_canvas_user_id
                    };
                    
                    // Proceed to login
                    console.log('LTI launch successful; redirecting to login...');
                    
                    res.redirect('/login');

                }
                
            }
            
        });
        
    }
    
    // LTI key doesn't match
    else {
        ltiDetails = null;
        res.status(403).send({ error: 'Invalid LTI key. Contact your Canvas administrator.' });
    }
    
});

// Authorization
app.get('/login', async function(req, res, next) {
    
    console.log('Login route ...', Date.now());

    let userQuery = User.find({ user_id : ltiDetails.user_id });
    let currentUser;
    let _id;
    
    // No successful LTI launch
    if (ltiDetails === null) {
        res.status(403).send('ERROR: This page can only be accessed following a valid LTI launch.');
    }
    
    // Test for user
    // Find record with current user's Canvas ID retrieved through LTI launch
    userQuery.exec(async function(err, users) {
        
        // If user exists
        if (users.length > 0) {
            currentUser = users[0];
            
            let refreshToken = currentUser.refresh_token;
            let tokenObject = {
                access_token: currentUser.access_token,
                refresh_token: refreshToken
            };
            let accessToken = await oauth2.accessToken.create(tokenObject);
            let expiry = new Date(currentUser.expires_at);
            let rightNow = new Date();

            _id = currentUser._id;

            // Token has expired and needs to be refreshed
            if (accessToken.expired() || expiry.valueOf() - rightNow.valueOf() <= 360000) {

                console.log('Access token is expired; refreshing now...');

                try {
                    accessToken = await accessToken.refresh();

                    User.updateOne({_id : _id}, {
                        access_token: accessToken.token.access_token,
                        expires_at: accessToken.token.expires_at
                    }, function(err, result) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log('Token reset: ', accessToken.token.access_token);
                            myToken = accessToken.token.access_token;
                            res.redirect('/twill');
                        }
                    });

                } catch(err) {
                    console.log(err);
                }

            } 
            
            // Token is current
            else {
                console.log('Token is current: ', tokenObject.access_token);
                myToken = tokenObject.access_token;
                res.redirect('/twill');
            }

            res.end();
        } 
        
        // User does not exist so begin initial OAuth flow
        else {
            console.log('No user data; initiating OAuth flow...');
            
            res.redirect('/auth/canvas');
        }
    });
    
});

// Initial redirect for OAuth flow
app.get('/auth/canvas', function(req, res) {
    console.log('Initiating OAuth flow...', Date.now());
    console.log(authUri);
    res.redirect(authUri);
});

// Receives auth code and requests access token
app.get('/auth/canvas/callback', async function(req, res) {
    
    console.log('Auth callback...', Date.now());
    
    // Initial access code
    const code = req.query.code;
    
    console.log(code);
    
    
    try {
        const result = await oauth2.authorizationCode.getToken({ code });
        const token = oauth2.accessToken.create(result);
        
        let user = new User({
            user_id: ltiDetails.user_id,
            access_token: token.token.access_token,
            refresh_token: token.token.refresh_token,
            expires_at: token.token.expires_at
        });
        
        user.save(function(err) {
            
            if (err) {
                console.log(err);
            } else {
                console.log('New user record saved...');
                console.log('Redirecting to login...', Date.now());
                
                return res.redirect('/login');
            }
            
            
        });
        
    } catch(err) {
        return res.status(500).send('Authentication failed.');
    }
    
});

app.use('/twill', function(req, res, next) {
    res.locals.token = myToken;
    next();
}, function(req, res, next) {
    console.log('Twill');
    console.log('Token: ', res.locals.token);
    req.course_id = ltiDetails.course_id;
    req.canvas_instance = ltiDetails.canvas_instance

    next();
}, twillRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
