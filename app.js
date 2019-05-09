const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const lti = require('ims-lti');
const path = require('path');
const simpleOauth2 = require('simple-oauth2');

// Temporary storage for LTI info
let ltiDetails = null;

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

// Session cookie for LTI launch info
app.use(cookieSession({
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000 * 180), // 180 days from now
    name: 'session',
    keys: ['mySecretKey1', 'mySecretKey2']
}));

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
                    
                }
                
                // Proceed to login
                console.log('LTI launch successful; redirecting to login...');
                res.redirect('/login');
                
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
    
    console.log('Login ...');
    
    // No successful LTI launch
    if (ltiDetails === null) {
        res.status(403).send('ERROR: This page can only be accessed following a valid LTI launch.');
    }
    
    console.log('session: ', req.session);
    
    // First session -- session cookie isn't populated
    if (!req.session.populated) {
        
        console.log('No session data; initiating OAuth flow.');
        
        // Begin OAuth flow
        res.redirect('/auth/canvas');
        
    }
    
    // Not the first session
    else {
        
        console.log('Session data exists; checking token status.');
        console.log('Session expires at ', req.sessionOptions.expires);
        
        let refreshToken = req.session.refresh_token;
        let tokenObject = {
            access_token: req.session.access_token,
            refresh_token: refreshToken
        };
        let accessToken = oauth2.accessToken.create(tokenObject);
        let rightNow = new Date();
        let expiry = new Date(req.session.expires_at);
        
        console.log((expiry.valueOf() - rightNow.valueOf()) / 1000 / 60 + ' minutes until token expires.');
        
        // Token has expired
        if (accessToken.expired() || expiry.valueOf() - rightNow.valueOf() <= 360000) {
            
            console.log('Token is expired; refreshing...');
            
            try {
                accessToken = await accessToken.refresh();
                
                req.session = {
                    access_token: accessToken.token.access_token,
                    refresh_token: refreshToken,
                    expires_at: accessToken.token.expires_at
                };
                
                console.log('Authentication refreshed.');
                
                res.redirect('/twill');
            } catch(err) {
                console.log(err);
            }
        } 
        
        // Token is current
        else {
            res.redirect('/twill');
        }
        
    }
    
});

// Initial redirect for OAuth flow
app.get('/auth/canvas', function(req, res) {
    console.log('Initiating OAuth flow');
    console.log(authUri);
    // Debugging weird OAuth issue that suddenly cropped up
    console.log(req);
    res.redirect(authUri);
});

// Receives auth code and requests access token
app.get('/auth/canvas/callback', async function(req, res) {
    
    console.log('Auth callback');
    
    // Initial access code
    const code = req.query.code;
    
    console.log(code);
    
    try {
        const result = await oauth2.authorizationCode.getToken({ code });
        const token = oauth2.accessToken.create(result);
        
        req.session = {
            access_token: token.token.access_token,
            refresh_token: token.token.refresh_token,
            expires_at: token.token.expires_at
        };
        
        console.log(req.session);
        
        return res.redirect('/login');
        
    } catch(err) {
        return res.status(500).send('Authentication failed.');
    }
    
});

app.use('/twill', function(req, res, next) {
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
