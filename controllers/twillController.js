const html2text = require('html-to-text');
const rp = require('request-promise');

// Canvas API pagination regex
const nextLinkRegEx = new RegExp('^<(.*)>; rel="next"$');

// Twill index page
exports.index = function(req, res) {
    res.render('index', { title: 'Twill'});
};

// Course roster
exports.getRoster = function(req, res) {
    
    var uri = 'https://' + req.canvas_instance + '/api/v1/courses/' + req.course_id + '/users';
    var token = res.locals.token;

    getRoster(token, uri, [])
        .then(function(response) {
            res.send(response);
        });
    
};

// Get discussion entries in a topic
exports.getEntries = function(req, res) {
    
    var uri = 'https://' + req.canvas_instance + '/api/v1/courses/' + req.course_id + '/discussion_topics/' + req.params.id + '/view';
    var token = req.access_token;
    
    getEntries(token, uri, [])
        .then(function(response) {
            res.send(response);
        });
    
}

// Get discussion topics
exports.getTopicList = function(req, res) {
    
    var uri = 'https://' + req.canvas_instance + '/api/v1/courses/' + req.course_id + '/discussion_topics';
    var token = req.access_token;
    
    getTopicList(token, uri, [])
        .then(function(response) {
            res.send(response);
        });
    
};

// From https://stackoverflow.com/questions/18679576/counting-words-in-string
function countWords(str) {
    return str.trim().split(/\s+/).length;
}

function processReplies(replies) {
    
    var output = [];
    
    replies.forEach(function(reply) {
        
        var obj = {
            id: reply.id,
            message: html2text.fromString(reply.message, {
                wordwrap: false,
                ignoreHref: true,
                ignoreImage: true
            }),
            user_id: reply.user_id
        };
        
        obj.message_length = countWords(obj.message);
        
        if (reply.created_at) {
            obj.created_at = reply.created_at;
        }
        
        if (reply.replies) {
            obj.children = (function() {
                return processReplies(reply.replies)
            })();
        }
        
        output.push(obj)
        
    });
    
    return output;
    
}

function getEntries(token, uri, entries) {
    
    return rp({
        headers: {
            'Authorization': 'Bearer ' + token
        },
        json: true,
        resolveWithFullResponse: true,
        uri: uri
    }).then(function(response) {
        
        var entries = [];
        
        response.body.view.forEach(function(entry) {
            
            var obj = {
                id: entry.id,
                message: html2text.fromString(entry.message, {
                    wordwrap: false,
                    ignoreHref: true,
                    ignoreImage: true
                }),
                user_id: entry.user_id
            };
            
            obj.message_length = countWords(obj.message);
            
            if (entry.created_at) {
                obj.created_at = entry.created_at;
            }
                        
            if (entry.replies) {
                
                obj.children = (function() {
                   return processReplies(entry.replies);
                })();
                
            } 
            
            entries.push(obj);
            
        });
        
        return entries;
                                
    });
    
}


// Fetch course roster
function getRoster (token, uri, people) {
    
    return rp({
        headers: {
            'Authorization': 'Bearer ' + token
        },
        json: true,
        resolveWithFullResponse: true,
        uri: uri
    }).then(function(response) {
        
        var next = getNextPage(response.headers.link);
        
        if (!people) {
            people = [];
        }
        
        response.body.forEach(function(person) {
            
            people.push({
                id: person.id,
                short_name: person.short_name,
                sortable_name: person.sortable_name
            });
            
        });
        
        if (next) {
            return getRoster(token, next, people);
        }
        
        return people;
    });
    
}

// Fetch discussion topics
function getTopicList (token, uri, topics) {
        
    return rp({
        headers: {
            'Authorization': 'Bearer ' + token
        },
        json: true,
        resolveWithFullResponse: true,
        uri: uri
    }).then(function(response) {
        
        if (!topics) {
            topics = [];
        }
        
        response.body.forEach(function(topic) {
            
            var message = html2text.fromString(topic.message, {
                wordwrap: false,
                ignoreHref: true,
                ignoreImage: true
            });
            
            topics = topics.concat({
                id: topic.id,
                url: uri.replace(/\?[a-z0-9_=&]+/, '') + '/' + topic.id,
                user_id: topic.author.id || null,
                message: message,
                message_length: countWords(message),
                title: topic.title,
                subentry_count: topic.discussion_subentry_count
            });
            
        });
        
        let next = getNextPage(response.headers.link);
        
        if (next) {
            return getTopicList(token, next, topics);
        }
        
        return topics;
        
    });
    
}



// Handle Canvas API pagination by extracting and returning the
// link to the next page of results, if there is one
function getNextPage(headerLink) {
    
    let url = null;
    
    if (headerLink) {
        
        var links = headerLink.split(',');
        
        links.forEach(function(link) {
            
            var matches = nextLinkRegEx.exec(link);
            
            if (matches) {
                url = matches[1];
            }
            
        });
        
    }
    
    return url;
    
}