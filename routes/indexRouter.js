var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {

    console.log(req.session);
    
    // Error if LTI launch parameters haven't been stored in session
    if (!req.session || (!req.session.user_id || !req.session.course_id )) {
        
        res.status('500').send({ error: 'Invalid LTI configuration. Contact your Canvas administrator.' });
        
    } else { 

        res.render('index', { title: 'Express', user_id: req.session.user_id, course_id: req.session.course_id, canvas_instance: req.session.canvas_instance });   

    }
  
});

module.exports = router;
