// Documentation
 
// References
// An excellent explaination walk-through of d3 https://bl.ocks.org/denjn5/e1cdbbe586ac31747b4a304f8f86efa5
// https://observablehq.com/@d3/radial-dendrogram
// https://observablehq.com/@d3/cluster-dendrogram
// https://observablehq.com/@d3/tidy-tree
// https://observablehq.com/@d3/radial-tidy-tree
// https://github.com/d3/d3-hierarchy/blob/master/README.md#tree
// https://github.com/d3/d3-zoom

define([
    'jquery',
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'd3',
    'tinycolor2'
],
function(
    $,
    SplunkVisualizationBase,
    vizUtils,
    d3,
    tinycolor
) {

    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = "dendrogram_viz_" + Math.round(Math.random() * 1000000);
            var theme = 'light'; 
            if (typeof vizUtils.getCurrentTheme === "function") {
                theme = vizUtils.getCurrentTheme();
            }
            viz.text_color = "white";
            viz.shadow_color = "#171d21";
            if (theme === "light") {
                viz.text_color = "#171d21";
                viz.shadow_color = "white";
            }
            viz.$container_wrap = $(viz.el);
            viz.$container_wrap.addClass("dendrogram_viz-container");
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.config = {
                layout: "horizontal", 
                tidy: "yes",
                max_rows: "1000",
                node_sibling_spacing: "30",
                node_ancestor_spacing: "100",
                label_size: "10",
                node_size: "4",
                radius: "300",
                zoom: "no",
                delimiter: "/",
                html: "no"
            };
            // Override defaults with selected items from the UI
            for (var opt in config) {
                if (config.hasOwnProperty(opt)) {
                    viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = config[opt];
                }
            }
            viz.data = data;
            viz.scheduleDraw();
        },

        // debounce the draw
        scheduleDraw: function(){
            var viz = this;
            clearTimeout(viz.drawtimeout);
            viz.drawtimeout = setTimeout(function(){
                viz.doDraw();
            }, 300);
        },

        doDraw: function(){
            var viz = this;
            // Dont draw unless this is a real element under body
            if (! viz.$container_wrap.parents().is("body")) {
                return;
            }
            // Container can have no height if it is in a panel that isnt yet visible on the dashboard.
            // I believe the container might also have no size in other situations too
            if (viz.$container_wrap.height() <= 0) {
                //console.log("not drawing becuase container has no height");
                if (!viz.hasOwnProperty("resizeWatcher")) {
                    viz.resizeWatcher = setInterval(function(){
                        if (viz.$container_wrap.height() > 0) {
                            clearInterval(viz.resizeWatcher);
                            delete viz.resizeWatcher;
                            viz.scheduleDraw();
                        }
                    }, 1000);
                }
                return;
            }
            if (viz.hasOwnProperty("resizeWatcher")) {
                clearInterval(viz.resizeWatcher);
                delete viz.resizeWatcher;
            }

            var skippedRows = 0;
            var validRows = 0;
            var data = {"name": "", "children": []};
            var i, k, foundChild;
            for (i = 0; i < viz.data.results.length; i++) {
                if (! viz.data.results[i].path) {
                    skippedRows++;
                    continue;
                }
                validRows++;
                // Names contains node names, parts contains Ids used in hierarchy construction
                var parts = viz.data.results[i].path.split(viz.config.delimiter);
                var names = viz.data.results[i].names;
                if (names != undefined) {
                    names = names.split(viz.config.delimiter);
                }
                // Remove first element if it is blank
                if (parts.length > 0 && parts[0] === "") {
                    parts.shift();
                }
                // Same logic for names and if no names specified, default to using parts
                if (names != undefined) {
                    if (names.length > 0 && names[0] === "") {
                        names.shift();
                    }
                } else {
                    names = parts;
                }
                
                var currentNode = data;
                for (var j = 0; j < parts.length; j++) {
                    var children = currentNode.children;
                    if (typeof children === "undefined") {
                        children = [];
                    }
                    var nodeId = parts[j];
                    var nodeName = names[j];
                    var childNode;
                    if (j + 1 < parts.length) {
                        // Not yet at the end of the sequence; move down the tree.
                        foundChild = false;
                        for (k = 0; k < children.length; k++) {
                            if (children[k].id == nodeId) {
                                childNode = children[k];
                                foundChild = true;
                                break;
                            }
                        }
                        // If we don't already have a child node for this branch, create it.
                        if (!foundChild) {
                            childNode = {"name": nodeName, "path": viz.data.results[i].path, "id": nodeId, "children": []};
                            children.push(childNode);
                        }
                        currentNode = childNode;
                    } else {
                        foundChild = false;
                        for (k = 0; k < children.length; k++) {
                            if (children[k].id == nodeId) {
                                childNode = children[k];
                                foundChild = true;
                                break;
                            }
                        }
                        if (!foundChild) {
                            // Reached the end of the sequence; create a leaf node.
                            childNode = {"name": nodeName, "path": viz.data.results[i].path, "id": nodeId, "children": []};
                            children.push(childNode);
                        }
                        if (viz.data.results[i].hasOwnProperty("color")) {
                            childNode.color = viz.data.results[i].color;
                        }
                        if (viz.data.results[i].hasOwnProperty("tooltip")) {
                            childNode.tooltip = viz.data.results[i].tooltip;
                        }
                        if (viz.data.results[i].hasOwnProperty("drilldown")) {
                            childNode.drilldown = viz.data.results[i].drilldown;
                        }
                    }
                }
            }

            if (skippedRows) {
                console.log("Rows skipped because missing path field: ", skippedRows);
            }
            if (skippedRows && ! validRows) {
                viz.$container_wrap.empty().append("<div class='dendrogram_viz-bad_data'>Invalid Data, there should be a column called 'path' (delimited by '/' by default).</div>");
                return;
            }
            if (validRows > Number(viz.config.max_rows)) {
                viz.$container_wrap.empty().append("<div class='dendrogram_viz-bad_data'>Too many rows of data. Increase limit in formatting settings (Total rows:" + validRows + ", Limit: " + viz.config.max_rows + "). </div>");
                return;
            }

            function tooltipCreate(d) {
                var parts = d.ancestors().map(function(d) { return d.data.name; }).reverse();
                // if root node, then no tooltips
                if (parts.length === 1) {
                    return;
                }
                var tt = $("<div></div>");
                for (var i = 1; i < parts.length; i++) {
                    $("<span></span>").text(parts[i]).appendTo(tt);
                    if (i < (parts.length - 1)) {
                        $("<span class='dendrogram_viz-tooltip-divider'> " + viz.config.delimiter + " </span>").appendTo(tt);
                    }
                }
                if (d.data.hasOwnProperty("tooltip") && d.data.tooltip) {
                    if (viz.config.html === "yes") {
                        $("<div></div>").html(d.data.tooltip).appendTo(tt);
                    } else {
                        $("<div></div>").text(d.data.tooltip).appendTo(tt);
                    }
                }
                viz.container_wrap_offset = viz.$container_wrap.offset();
                return tooltip.css("visibility", "visible").html(tt);
            }

            // we move tooltip during of "mousemove"
            function tooltipMove(event) {
                return tooltip.css({
                    "top": (event.pageY - viz.container_wrap_offset.top - 30) + "px", 
                    "left": (event.pageX - viz.container_wrap_offset.left + 20) + "px"
                });
            }

            // we hide our tooltip on "mouseout"
            function tooltiphide() {
                return tooltip.css("visibility", "hidden");
            }

            function nodeClick(d) {
                var tokens = {
                    name: d.data.name
                };
                if (d.data.hasOwnProperty("path") && d.data.path){
                    tokens.path = d.data.path;
                }
                if (d.data.hasOwnProperty("id") && d.data.id){
                    tokens.id = d.data.id;
                }
                if (d.data.hasOwnProperty("drilldown") && d.data.drilldown){
                    tokens.drilldown = d.data.drilldown;
                }
                var defaultTokenModel = splunkjs.mvc.Components.get('default');
                var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
                for (var item in tokens) {
                    if (tokens.hasOwnProperty(item)) {
                        console.log("Setting token $dendrogram_viz_" +  item + "$ to \"" + tokens[item] + "\"");
                        if (defaultTokenModel) {
                            defaultTokenModel.set("dendrogram_viz_" + item, tokens[item]);
                        } 
                        if (submittedTokenModel) {
                            submittedTokenModel.set("dendrogram_viz_" + item, tokens[item]);
                        }
                    }
                }
            }

            var width = viz.$container_wrap.width() - 20;
            var height = viz.$container_wrap.height() - 20;
            var svg = d3.create("svg")
                .style("font", Number(viz.config.label_size) + "px sans-serif")
                .style("box-sizing", "border-box");
            var svg_canvas = svg.append("g").attr("class", "zoomwrap");

            var dataInHierarchy = d3.hierarchy(data).sort(function(a, b) {
                return d3.descending(a.height, b.height);
            });
            var root;
            if (viz.config.tidy === "yes") {
                if (viz.config.layout !== "radial") {
                    root = d3.tree().nodeSize([viz.config.node_sibling_spacing, viz.config.node_ancestor_spacing])(dataInHierarchy);
                } else {
                    root = d3.tree()
                        .size([2 * Math.PI, Number(viz.config.radius)])
                        .separation(function(a, b) { return (a.parent == b.parent ? 1 : 2) / a.depth; })(dataInHierarchy);
                }
            } else {
                if (viz.config.layout !== "radial"){
                    dataInHierarchy.dx = viz.config.node_sibling_spacing;
                    dataInHierarchy.dy = viz.config.node_ancestor_spacing;
                    root = d3.cluster().nodeSize([
                        dataInHierarchy.dx,  // width
                        dataInHierarchy.dy   // height
                    ])(dataInHierarchy);
                } else {
                    root = d3.cluster().size([2 * Math.PI, Number(viz.config.radius)])(dataInHierarchy);
                }
            }

            var data_nodes = root.descendants().filter(function(d){ return d.depth > 0; })
            var data_links = root.links().filter(function(d){ return d.source.depth > 0; })

            svg_canvas.append("g")
                .attr("class","dendrogram_viz-links")
                .attr("fill", "none")
                .attr("stroke", "#555")
                .attr("stroke-opacity", 0.4)
                .attr("stroke-width", 1.5)
                .selectAll("path")
                .data(data_links)
                .join("path")
                .attr("d", function(d) {
                    if (viz.config.layout === "horizontal") {
                        return "M" + (d.target.y) + "," + (d.target.x) + " " +
                            "C" + (d.target.y - viz.config.node_ancestor_spacing * 0.7) + "," + (d.target.x) + " " +
                            (d.source.y + viz.config.node_ancestor_spacing * 0.7) + "," + (d.source.x) + " " +
                            (d.source.y) + "," + (d.source.x);

                    } else if (viz.config.layout === "vertical") {
                        return "M" + (d.target.x) + "," + (d.target.y) + " " +
                            "C" + (d.target.x) + "," + (d.target.y - viz.config.node_ancestor_spacing * 0.7) + " " +
                            (d.source.x) + "," + (d.source.y + viz.config.node_ancestor_spacing * 0.7) + " " +
                            (d.source.x) + "," + (d.source.y);

                    } else if (viz.config.layout === "radial") {
                        return d3.linkRadial()
                            .angle(function(d) { return d.x; })
                            .radius(function(d) { return d.y; })
                            (d);
                    }
                });

            svg_canvas.append("g")
                .attr("class","dendrogram_viz-nodes")
                .selectAll("circle")
                .data(data_nodes)
                .join("circle")
                .attr("transform", function(d) { 
                    if (viz.config.layout === "horizontal") {
                        return "translate(" + d.y + "," + d.x + ")";
                    } else if (viz.config.layout === "vertical") {
                        return "translate(" + d.x + "," + d.y + ")";
                    } else if (viz.config.layout === "radial") {
                        return "rotate(" + (d.x * 180 / Math.PI - 90) + ") translate(" + d.y + ",0)";
                    }
                })
                .attr("stroke", function(d) { return d.data.hasOwnProperty("color") ? tinycolor(d.data.color).darken(20).toString() : "#777"; })
                .attr("fill", function(d) { return d.data.hasOwnProperty("color") ? d.data.color : "#999"; })
                .attr("r", Number(viz.config.node_size))
                .on("mouseover", function(d) { tooltipCreate(d); })
                .on("mousemove", function() { tooltipMove(event); })
                .on("mouseout", tooltiphide)
                .on("click", function(d){ nodeClick(d); });

            if (viz.config.layout === "horizontal") {
                svg_canvas.append("g")
                .attr("class","dendrogram_viz-labels")
                .attr("stroke-linejoin", "round")
                .attr("stroke-width", 3)
                .attr("fill", viz.text_color)
                .selectAll("text")
                .data(data_nodes)
                .join("text")
                .attr("x", function(d) { return d.y; })
                .attr("y", function(d) { return d.x; })
                .attr("dy", "0.31em")
                .attr("dx", function(d) {
                    return d.children ? (Number(viz.config.node_size) + Number(viz.config.label_size) * 0.5) * -1 : (Number(viz.config.node_size) + Number(viz.config.label_size) * 0.5);
                })
                .text(function(d) { return d.data.name; })
                .on("mouseover", function(d) { tooltipCreate(d); })
                .on("mousemove", function() { tooltipMove(event);})
                .on("mouseout", tooltiphide)
                .on("click", function(d){ nodeClick(d); })
                .attr("text-anchor", function(d) { return !!d.children ? "end" : "start";})
                .clone(true)
                .lower()
                .attr("stroke", viz.shadow_color);

            } else if (viz.config.layout === "vertical") {
                svg_canvas.append("g")
                .attr("class","dendrogram_viz-labels")
                .attr("stroke-linejoin", "round")
                .attr("stroke-width", 3)
                .attr("fill", viz.text_color)
                .selectAll("text")
                .data(data_nodes)
                .join("text")
                .attr("transform", function(d) { 
                    return "translate(" + (d.x + (Number(viz.config.node_size)) * 1) + "," + (d.y + (Number(viz.config.node_size) + Number(viz.config.label_size) * 0.1) * 1) + ") rotate(30)";
                })
                .text(function(d) { return d.data.name; })
                .on("mouseover", function(d) { tooltipCreate(d); })
                .on("mousemove", function() { tooltipMove(event); })
                .on("mouseout", tooltiphide)
                .on("click", function(d){ nodeClick(d); })
                .clone(true)
                .lower()
                .attr("stroke", viz.shadow_color);
                

            } else if (viz.config.layout === "radial") {
                svg_canvas.append("g")
                .attr("class","dendrogram_viz-labels")
                .attr("stroke-linejoin", "round")
                .attr("stroke-width", 3)
                .attr("fill", viz.text_color)
                .selectAll("text")
                .data(data_nodes)
                .join("text")
                .attr("transform", function(d) { return "rotate(" + (d.x * 180 / Math.PI - 90) + ") translate(" + d.y + ",0) rotate(" + (d.x >= Math.PI ? "180" : "0") + ")"; })
                .attr("dy", "0.31em")
                .attr("x", function(d) { return d.x < Math.PI === !d.children ? (Number(viz.config.node_size) + Number(viz.config.label_size) * 0.5) : (Number(viz.config.node_size) + Number(viz.config.label_size) * 0.5) * -1; })
                .attr("text-anchor", function(d) { return d.x < Math.PI === !d.children ? "start" : "end"; })
                .text(function(d) { return d.data.name; })
                .on("mouseover", function(d) { tooltipCreate(d); })
                .on("mousemove", function() { tooltipMove(event);})
                .on("mouseout", tooltiphide)
                .on("click", function(d){ nodeClick(d); })
                .clone(true)
                .lower()
                .attr("stroke", viz.shadow_color);
            }

            var svg_node = svg.node();
            document.body.appendChild(svg_node);
            var bbox = svg_node.getBBox();
            document.body.removeChild(svg_node);
            svg.attr("viewBox", [bbox.x - 10, bbox.y - 10, bbox.width + 20, bbox.height + 20]);
            svg.attr("width", width + "px").attr("height", height + "px");
            var tooltip = $("<div class='dendrogram_viz-tooltip'></div>");
            viz.$container_wrap.empty();
            viz.$container_wrap.append(svg_node, tooltip);
            if (viz.config.zoom === "yes") {
                svg.call(d3.zoom().on("zoom", function() {
                    svg_canvas.attr("transform", d3.event.transform);
                }));
            }
        },

        // Override to respond to re-sizing events
        reflow: function() {
            this.scheduleDraw();
        },

        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: 10000
            });
        },
    };


    return SplunkVisualizationBase.extend(vizObj);
});
