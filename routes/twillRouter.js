const express = require('express');
const router = express.Router();
var twillController = require('../controllers/twillController');

/* GET twill page. */
router.get('/', twillController.index);

/* GET course roster */
router.get('/roster', twillController.getRoster);

/* GET discussion topics */
router.get('/topicList', twillController.getTopicList);

/* GET discussion topic entries */
router.get('/topics/:id', twillController.getEntries);

/* POST resize request */
router.post('/resize', twillController.resizeFrame);

module.exports = router;