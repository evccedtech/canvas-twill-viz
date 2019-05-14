const color = d3.scaleSequential(d3.interpolateReds).domain([0,8]);
const format = d3.format(",");

function getRoster() {
    return $.get('https://canvas-twill-viz.herokuapp.com/twill/roster');
}

function getTopicList() {
    return $.get('https://canvas-twill-viz.herokuapp.com/twill/topicList');
}

function getEntries(topicId) {
    return $.get('https://canvas-twill-viz.herokuapp.com/twill/topics/' + topicId);
}

function loadRoster(roster) {
    
    var $roster = $('#roster select');
    
    roster.forEach(function(person) {
        $roster.append('<option value="' + person.id + '">' + person.sortable_name + '</option>');
    });
    
    $roster.change(function(e) {
        
        var id = $(e.currentTarget).val();
        
        selectRosterName(id);
    });
    
}

function resetSelectionStats() {
    
    $rows = $("#info tbody > tr");
    
    $rows.each(function() {
        $(this).find('td:eq(2)').text('');
    });
    
}

function selectRosterName(id) {

    var selection = d3.selectAll('.node[data-twill-id="' + id + '"]');
    
    d3.selectAll('.node')
        .each(function(d) {
            d3.select(this)
                .transition()
                .duration(500)
                .style('fill', function(d) {
                if (d.parent === null) {
                    return '#fff';
                } else {
                    if (d.depth) { 
                        return color(d.depth); 
                    } else {
                        return color(2);
                    }
                }
            })
        });
    
    selection.transition()
        .duration(500)
        .style('fill', '#00bfff');
        
    getSelectionStats(selection);
    
}

function resetRosterName() {
    $("#roster select option[value='---']").prop('selected', true);
}

function getAuthorInfo(authorInfo) {
    
    var author = {};
    
    if (authorInfo.length > 0) {
        author.id = authorInfo[0].id;
        author.name = authorInfo[0].short_name;
    } else {
        author.id = 0;
        author.name = 'Unknown User';
    }
    
    return author;
    
}

function getVizWidth() {
    return $('#wrapper > .row > .ui.ten.wide.column').width();
}

function sumMessageLength(node) {
    
    var message_length;
    
    if (node.message_length) {
        message_length = node.message_length;
    } else {
        message_length = 0;
    }
    
    if (_.isArray(node)) {
        node.forEach(function(node) { 
            if (node.data) { // Will match hierarchies
                message_length += node.data.message_length;
            } else {
                message_length += node.message_length;
            }
        });
    } else if (node.children) {
        node.children.forEach(function(node) {
            message_length += sumMessageLength(node);
        });
    }
    
    return message_length;
    
}

function sumPosts(node) {
    
    var post_count;
    
    if (node.subentry_count) {
        post_count = node.subentry_count;
    } else {
        post_count = 0;
    }
    
    if (node.children) {
        node.children.forEach(function(node) {
            post_count += sumPosts(node);
        });
    }
    
    return post_count
    
}

function loadVizPack(data, roster) {
    
    var diameter,
        dimensions = {
            height: getVizWidth() * .5,
            width: getVizWidth()
        },
        format,
        margin = 40,
        node,
        pack,
        root,
        svg = d3.select('#viz svg');
        
    svg.selectAll('g').remove();
    
    svg.attr('width', dimensions.width)
        .attr('height', dimensions.height);
        
    pack = d3.pack()
        .size([dimensions.width - 2 * margin, dimensions.height - 2 * margin])
        .padding(10);
        
    root = d3.hierarchy(data)
        .sum(function(d) { return d.children ? d.children.length : 1; })
        .sort(function(a, b) { return a.height - b.height; });
        
    node = svg.selectAll('g')
        .data(pack(root).descendants())
        .enter()
        .append('g')
        .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        
    node.append('circle')
        .attr('class', 'node')
        .attr('r', function(d) { return 0; })
        .attr('data-twill-id', function(d) {

            var author = getAuthorInfo(_.where(roster, {id: d.data.user_id}));
            
            return author.id;
            
        })
        .style('stroke', function(d) { return color(d.depth + 2); })
        .style('stroke-width', 0)
        .style('opacity', 0)
        .style('fill', function(d) {
            if (d.parent === null) {
                return '#fff';
            } else {
                return color(d.depth);
            }
        })
        .attr('title', function(d) {
            var author = getAuthorInfo(_.where(roster, {id: d.data.user_id}));
            
            return author.short_name + '\n' + d.data.message;
        })
        .on('mouseover', function(d) {
            if (d.parent !== null) {
                d3.select(this).style('stroke-width', 1);
            }
        })
        .on('mouseout', function(d) {
            d3.select(this).style('stroke-width', 0);
        });
        
    node.selectAll('circle')
        .transition()
        .duration(250)
        .delay(function(d) { return d.depth * 250; })
        .attr('r', function(d) { return d.r; })
        .style('opacity', 1);
    
}

function loadVizSunburst(data, roster) {

    var arc,
        dimensions = {
            height: getVizWidth() * .5,
            width: getVizWidth()
        },
        margin = 40,
        nodes,
        partition,
        path,
        radius = Math.min(dimensions.width - margin, dimensions.height - margin) / 2,
        root,
        svg = d3.select('#viz svg');
    
    svg.selectAll('g').remove();
    
    svg.attr('width', dimensions.width - margin)
        .attr('height', dimensions.height - margin);
        
    arc = d3.arc()
        .startAngle(function(d) { return d.x0; })
        .endAngle(function(d) { return d.x1; })
        .innerRadius(function(d) { return Math.sqrt(d.y0); })
        .outerRadius(function(d) { return Math.sqrt(d.y1); });
        
    partition = d3.partition()
        .size([2 * Math.PI, radius * radius]);
        
    root = d3.hierarchy(data)
        .sum(function(d) { return d.children ? d.children.length : 1; })
        .sort(function(a, b) { return b.value - a.value; });
    
    path = svg.selectAll('g')
        .data(partition(root).descendants())
        .enter()
        .append('g')
        .attr('transform', 'translate(' + (dimensions.width - margin) / 2 + ',' + (dimensions.height - margin) / 2 + ')');
        
    path.append('path')
        .attr('class', 'node')
        .attr('d', arc)
        .attr('data-twill-id', function(d) {

            var author = getAuthorInfo(_.where(roster, {id: d.data.user_id}));
            
            return author.id;
            
        })
        .style('stroke', function(d) { return color(d.depth + 2); })
        .style('stroke-width', 0)
        .style('fill', function(d) { 
            if (d.parent === null) {
                return '#fff';
            } else {
                return color(d.depth);
            }
        })
        .style('opacity', 0)
        .on('mouseover', function(d) {
            if (d.parent !== null) {
                d3.select(this).style('stroke-width', 1);
            }
        })
        .on('mouseout', function(d) {
            d3.select(this).style('stroke-width', 0);
        });
        
    path.selectAll('path')
        .transition()
        .duration(250)
        .delay(function(d) { return d.depth * 250; })
        .style('opacity', 1);

}

function loadVizTimeline(data, roster) {
    
    var dateExtent,
        dimensions = {
            height: getVizWidth() * .5,
            width: getVizWidth()
        },
        g,
        margin = 40,
        nodes,
        // Sort posts in descending order of message length so
        // they will stack properly in timeline
        posts = flattenPosts(data, []).sort(function(a, b) {
            return b.message_length - a.message_length;
        }),
        radius,
        svg = d3.select('#viz svg'),
        threads = data.children,
        timeFormat = d3.timeFormat('%I %p'),
        x,
        y;
        
    dateExtent = d3.extent(_.pluck(posts, 'created_at'));
    
    x = d3.scaleTime()
        .domain([new Date(dateExtent[0]), new Date(dateExtent[dateExtent.length - 1])])
        .range([0, dimensions.width - margin * 2]);

    y = d3.scaleLinear()
        .domain([24, 0])
        .range([0, dimensions.height - margin]);
        
    radius = d3.scaleLinear()
        .domain([0, d3.max(_.pluck(posts, 'message_length'))])
        .range([3, 16]);
    
    svg.selectAll('g').remove();
    
    svg.attr('width', dimensions.width)
        .attr('height', dimensions.height);

    g = svg.append('g')
        .attr('transform', 'translate(' + margin + ',' + margin / 2 + ')');
        
    nodes = g.selectAll('.post')
        .data(posts)
        .enter()
        .append('g')
        .attr('class', 'post')
        .attr('transform', function(d) {
            return 'translate(' + x(new Date(d.created_at)) + ',' + y(new Date(d.created_at).getHours()) + ')';
        });
        
    nodes.append('circle')
        .attr('class', 'node')
        .attr('r', 0)
        .attr('data-twill-id', function(d) { return d.user_id; })
        .style('stroke', color(4))
        .style('stroke-width', 0)
        .style('fill', color(2))
        .style('opacity', 0)
        .on('mouseover', function(d) {
            d3.select(this).style('stroke-width', 1);
        })
        .on('mouseout', function(d) {
            d3.select(this).style('stroke-width', 0);
        });;
        
    nodes.selectAll('circle')
        .transition()
        .duration(250)
        .delay(function(d) { return x(new Date(d.created_at)); })
        .attr('r', function(d) { return radius(d.message_length); })
        .style('opacity', 1);
        
    g.append('g')
        .attr('class', 'axis x')
        .attr('transform', 'translate(0,' + (dimensions.height - 40) + ')')
        .call(d3.axisBottom(x).ticks(4));
        
    g.append('g')
        .attr('class', 'axis y')
        .attr('transform', 'translate(0,0)')
        .call(d3.axisLeft(y)
            .tickFormat(function(d) { 
                return timeFormat(new Date("T" + d + ":00")).replace(/^0/, ''); 
            })
        );

}

function flattenPosts(data, posts) {
    
    posts = posts || [];
    
    if (data.children && _.isArray(data.children)) {
        
        data.children.forEach(function(child) {
            
            var obj = {
                id: child.id,
                created_at: child.created_at,
                user_id: child.user_id,
                message: child.message,
                message_length: child.message_length
            };
            
            if (obj.created_at) {                        
                posts.push(obj);
            }
            
            if (child.children) {
                flattenPosts(child, posts);
            } 
            
        });
          
    }
    
    return posts;
    
}

function loadVizTree(data, roster) {

    var box,
        dimensions = {
            height: getVizWidth() * .5,
            width: getVizWidth()
        },
        g,
        link,
        margin = 40,
        node,
        radius,
        svg = d3.select('#viz svg'),
        tree,
        root;
    
    svg.selectAll('g').remove();
    
    svg.attr('width', dimensions.width - margin)
        .attr('height', dimensions.height - margin);
        
    radius = Math.min(dimensions.width, dimensions.height) / 2;
        
    tree = d3.tree()
        .size([2 * Math.PI, radius])
        .separation(function(a, b) { return (a.parent == b.parent ? 1 : 2) / a.depth; });
        
    root = d3.hierarchy(data)
        .sum(function(d) { return d.children ? d.children.length : 1 })
        .sort(function(a, b) { return a.height - b.height; });
    
    g = svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', 1.5)
        .attr('transform', 'translate(' + radius + ',' + radius + ')');        
    
    link = g.append('g')
        .selectAll('path')
        .data(tree(root).links())
        .join('path')
        .attr('d', d3.linkRadial()
            .angle(function(d) { return d.x; })
            .radius(function(d) { return d.y; }));

    node = g.append('g')
        .attr('stroke-linejoin', 'round')
        .attr('stroke-width', 3)
        .selectAll('g')
        .data(tree(root).descendants().reverse())
        .join('g')
        .attr('transform', function(d) { return 'rotate(' + (d.x * 180 / Math.PI - 90) +') translate(' + d.y + ',' + '0)'; });
        
    node.append('circle')
        .attr('fill', function(d) { return d.children ? '#555' : '#999'; })
        .attr('r', 2.5);
        
    node.append('text')
        .attr('dy', '.31em')
        .attr('x', function(d) { return d.x < Math.PI === !d.children ? 6 : 6; })
        .attr('text-anchor', function(d) { return d.x < Math.PI === !d.children ? 'start' : 'end'; })
        .attr('transform', function(d) { return d.x >= Math.PI ? 'rotate(180)' : null; })
        .text(function(d) { return d.data.id; });

}

function getTopicTitle(topic) {
    
    if (topic.data.title) {
        return topic.data.title;
    } else if (topic.parent) {
        if (topic.parent.data.title) {
            return topic.parent.data.title;
        } else {
            return getTopicTitle(topic.parent);
        }
    }
    
}

function getBasicStats(data) {
    
    var $info = $("#info > table > tbody"),
        numTopics = data.children.length,
        numPosts = sumPosts(data),
        numWords = sumMessageLength(data);
    
    
    $info.find('tr:eq(0) > td:eq(1)').text(numTopics);
    $info.find('tr:eq(1) > td:eq(1)').text(numPosts);
    $info.find('tr:eq(2) > td:eq(1)').text(format(numWords));
    $info.find('tr:eq(3) > td:eq(1)').text(format(Math.round(numWords / numPosts)));
}

function getSelectionStats(selection) {
    
    var data = selection.data(),
        $info = $("#info > table > tbody"),
        numTopics,
        numPosts = data.length,
        numWords = sumMessageLength(data);
    
    console.log(data);
    
    $info.find('tr:eq(0) > td:eq(2)').text('-');
    $info.find('tr:eq(1) > td:eq(2)').text(numPosts);
    $info.find('tr:eq(2) > td:eq(2)').text(format(numWords));
    
    if (numWords === 0 || numPosts === 0) {
        $info.find('tr:eq(3) > td:eq(2)').text('-');
    } else {
        $info.find('tr:eq(3) > td:eq(2)').text(format(Math.round(numWords / numPosts)));   
    }
        
}

function toggleViz(type, discussions, roster) {
    
    // Clear active roster selections
    resetRosterName();
    
    // Reset selection for statistics
    resetSelectionStats();

    switch(type) {
        case 'pack':
            loadVizPack(discussions, roster);
            break;
        case 'sunburst':
            loadVizSunburst(discussions, roster);
            break;
        case 'tree':
            loadVizTree(discussions, roster);
            break;
        case 'timeline':
            loadVizTimeline(discussions, roster);
            break;
    }
    
}

$(document).ready(function() {
    
    var discussions;
    var roster;
    
    var deferreds = [];

    $('.dimmer').dimmer('show');
    $('.dropdown').dropdown();
    $('#wrapper').on('click', '.menu .button:not(.active)', function(e) {
        
        var type = $(e.currentTarget).data('twill-viztype');
        
        $('#wrapper .button').removeClass('active');
        
        $(e.currentTarget).addClass('active');
        
        toggleViz.call(null, type, discussions, roster);
        
    });
    
    getRoster().then(function(data) {

        roster = data;
        
        roster.sort(function(a, b) {
            return a.sortable_name - b.sortable_name;
        });

        return getTopicList();
        
    }).done(function(data) {
        
        discussions = {
            id: 1,
            title: 'Discussions',
            children: data
        };
        
        discussions.children.forEach(function(child, idx) {
            
            var obj = {
                id: child.id,
                title: child.title,
                message: child.message
            };
            
            var authorInfo = _.where(roster, {id: child. id});
            
            if (authorInfo.length > 0) {
                obj.author_id = authorInfo.id;
                obj.author_name = authorInfo.short_name;
            }
            
            if (child.subentry_count > 0) {
                
                // Add each entry call to our deferreds
                deferreds.push(getEntries(child.id).done(function(data) {
                    discussions.children[idx].children = data;
                }));
                
            }
            
        });
        
        // Initialize viz only once all entry calls are complete
        $.when.apply(null, deferreds).done(function() {
            
            $('.dimmer').dimmer('hide');

            loadRoster(roster);
            loadVizPack(discussions, roster);
            getBasicStats(discussions);
            
            window.discussions = discussions;
            
        });
        
    });
    
});