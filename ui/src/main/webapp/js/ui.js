blocks = new Blocks();
blocks.scale = 1.4;
var templateMap = {};
var renameMap = {};
var defaults = {};
var clouds = new Array();

// Add a method to get a block by uuid
blocks.connectorCounter = 0;
blocks.getBlockByUUID = function (uuid) {
    var block;
    for (var i = 0; i < this.blocks.length; i++) {
        block = this.blocks[i];
        if (block._uuid && block._uuid === uuid) {
            return block;
        }
    }
    return null;
};

blocks.linkBlocks = function (sourceBlock, sourceOutput, targetBlock, targetInput) {
    if (sourceBlock.outputExists(sourceOutput) && targetBlock.inputExists(targetInput)) {
        console.log("Can link");
        var id = this.edgeId++;
        var connectorA = new Connector(sourceOutput, "output");
        var connectorB = new Connector(targetInput, "input");
        var edge = new Edge(id, sourceBlock, connectorA, targetBlock, connectorB, this);
        edge.create();
        var edgeIndex = this.edges.push(edge) - 1;
        this.redraw();
    }
};

Block.prototype.inputExists = function (name) {
    var id = name + "_input";
    for (var i = 0; i < this.connectors.length; i++) {
        if (this.connectors[i] === id) {
            return true;
        }
    }
    return false;
};

// Find a connector in a block
Block.prototype.outputExists = function (name) {
    var id = name + "_output";
    for (var i = 0; i < this.connectors.length; i++) {
        if (this.connectors[i] === id) {
            return true;
        }
    }
    return false;
};


// Override the addBlock method to add some more stuff
blocks.addBlock = function (name, x, y, nodeData) {
    console.log("Add blocks:" + name);

    for (var k in this.metas) {
        var type = this.metas[k];

        if (type.name == name) {
            var block = new Block(this, this.metas[k], this.id);
            block.x = x;
            block.y = y;
            block._uuid = guid();

            // Add settings if there are any

            if (nodeData) {
                var settings = nodeData.settings;
                block._uuid = nodeData.uuid;
                var fields = block.fields.fields;
                for (var j = 0; j < fields.length; j++) {
                    if (settings[fields[j].name]) {
                        fields[j].value = settings[fields[j].name];
                        console.log(fields[j].name);
                    }
                }

                // Add the replicas to the replicas field
                if (nodeData.targetClouds) {
                    var fieldName;

                    var keys = Object.keys(nodeData.targetClouds);
                    for (var i = 0; i < keys.length; i++) {
                        fieldName = "replicas_" + keys[i];
                        var fields = block.fields.fields;
                        for (var j = 0; j < fields.length; j++) {
                            if (fieldName === fields[j].name) {
                                fields[j].value = nodeData.targetClouds[keys[i]];
                            }
                        }
                    }
                }

                if (nodeData.outputCloud) {

                    keys = Object.keys(nodeData.targetClouds);
                    for (i = 0; i < keys.length; i++) {
                        fields = block.fields.fields;
                        for (var j = 0; j < fields.length; j++) {
                            if ("outputCloud" === fields[j].name) {
                                fields[j].value = nodeData.outputCloud;
                            }
                        }
                    }
                }
            }

            block.create(this.div.find('.blocks'));

            // Keep the template with the block so that we can get data
            // needed for the deployment
            if (templateMap[name]) {
                block._template = templateMap[name];
            }

            this.history.save();
            this.blocks.push(block);
            this.id++;
            return block;
        }
    }
};

(function () {
    function include(file) {
        $('head').append('<script type="text/javascript" src="demo/' + file + '"></script>');
    }

    Promise.all([

        fetchTopicList(function (data) {
            setupTopicBlocksJs(data);
        }),

        fetchClouds(function (data) {
            for (var i = 0; i < data.length; i++) {
                clouds.push(data[i]);
            }
        }),

        fetchNodeYaml(function (data) {
            setupBlocksJs(data);
            blocks.run('#blocks');
        })
    ])
        .then(function (p) {

            blocks.ready(function () {
                blocks.menu.addAction('Export', function (blocks) {
                    //alert($.toJSON(blocks.export()));
                    exportJson();
                }, 'export');

                if (_flowName) {
                    console.log("About to fetch Flow");
                    fetchFlowJson(_flowName, function (result) {
                        importJson(result);
                    })
                }
            })
        });


    blocks.types.addCompatibility('string', 'number');
    blocks.types.addCompatibility('string', 'bool');
    blocks.types.addCompatibility('bool', 'number');
    blocks.types.addCompatibility('bool', 'integer');
    blocks.types.addCompatibility('bool', 'string');

})
();


function fetchFlowJson(flowName, callback) {
    var promise = $.ajax({
        url: "rest/api/dataflows/" + flowName,
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

function importJson(customResource) {

    var drawingData = customResource.spec;

    // Create the blocks
    var nodeData;
    var block;
    var settings;
    var fields;

    for (var i = 0; i < drawingData.nodes.length; i++) {
        nodeData = drawingData.nodes[i];
        block = blocks.addBlock(nodeData.templateName, 100, 100, nodeData);
        console.log("Template: " + nodeData.templateName);
    }

    // Connect everything together
    var link;
    var source;
    var target;
    for (var i = 0; i < drawingData.links.length; i++) {
        link = drawingData.links[i];
        source = blocks.getBlockByUUID(link.sourceUuid);
        target = blocks.getBlockByUUID(link.targetUuid);
        if (source && target) {
            console.log("Linking:" + source._uuid + " to " + target._uuid);
            blocks.linkBlocks(source, link.sourcePortName, target, link.targetPortName);
        }
    }
    console.log("Imported data");
}

function exportJson(flowName) {
    var data = blocks.export();

    // Add the blocks
    var processorArray = new Array();
    var processorJson;
    var inputsArray;
    var outputsArray;
    var replicas;
    var settings;
    var block;
    var cloudName;
    var serializedBlock;

    for (var i = 0; i < data.blocks.length; i++) {
        serializedBlock = data.blocks[i];
        block = blocks.getBlockById(serializedBlock.id);
        if (block && block._template) {
            inputsArray = new Array();
            outputsArray = new Array();
            replicas = {};
            settings = {};

            if (block._template.inputs) {
                for (var j = 0; j < block._template.inputs.length; j++) {
                    inputsArray.push(block._template.inputs[j]);
                }
            }

            if (block._template.outputs) {
                for (var j = 0; j < block._template.outputs.length; j++) {
                    outputsArray.push(block._template.outputs[j]);
                }
            }

            //todo: this will only copy default values
            var field;
            var attrs;
            var outputCloud;
            if (block._template.settings && block.fields.fields) {
                for (var j = 0; j < block.fields.fields.length; j++) {
                    // Standard property
                    field = block.fields.fields[j];
                    if (!field.name.startsWith("replicas_")) {
                        attrs = field.attrs;
                        if (attrs && attrs.editable) {
                            // This can go in the settings
                            settings[field.name] = field.value;
                        }
                    }
                }
            }

            // Find the replicas data
            if (block.fields.fields) {
                for (var j = 0; j < block.fields.fields.length; j++) {
                    field = block.fields.fields[j];
                    if (field.name.startsWith("replicas_")) {
                        cloudName = field.name.substring(9);
                        replicas[cloudName] = field.value;
                    }
                }
            }

            if (block.fields.fields) {
                for (j = 0; j < block.fields.fields.length; j++) {
                    field = block.fields.fields[j];
                    if (field.name === "outputcloud") {
                        outputCloud = field.value;
                    }
                }
            }

            processorJson = {
                displayName: block._template.displayName,
                imageName: block._template.imageName,
                templateId: block._template.id,
                templateName: block._template.name,
                transport: block._template.transport,
                processorType: block._template.processorType,
                uuid: block._uuid,
                settings: settings,
                inputs: inputsArray,
                outputs: outputsArray,
                targetClouds: replicas,
                outputCloud: outputCloud
            };

            processorArray.push(processorJson);

        }
    }

    // Add the edges / links
    var block1;
    var block2;
    var serializedEdge;
    var serializedConnector1;
    var serializedConnector2;
    var sourcePort;
    var sourceUuid;
    var targetPort;
    var targetUuid;
    var linksArray = new Array();


    for (var i = 0; i < data.edges.length; i++) {
        serializedEdge = data.edges[i];
        serializedConnector1 = data.edges[i].connector1;
        serializedConnector2 = data.edges[i].connector2;

        block1 = blocks.getBlockById(serializedEdge.block1);
        block2 = blocks.getBlockById(serializedEdge.block2);

        if (serializedConnector1[1] === "output" && serializedConnector2[1] === "input") {
            // 1 is the output, 2 is the input
            sourceUuid = block1._uuid;

            if (renameMap[serializedConnector1[0]]) {
                sourcePort = renameMap[serializedConnector1[0]];
            } else {
                sourcePort = serializedConnector1[0];
            }

            targetUuid = block2._uuid;

            if (renameMap[serializedConnector2[0]]) {
                targetPort = renameMap[serializedConnector2[0]];
            } else {
                targetPort = serializedConnector2[0];
            }

        } else if (serializedConnector1[1] === "input" && serializedConnector2[1] === "output") {
            sourceUuid = block2._uuid;

            if (renameMap[serializedConnector2[0]]) {
                sourcePort = renameMap[serializedConnector2[0]];
            } else {
                sourcePort = serializedConnector2[0];
            }

            targetUuid = block1._uuid;

            if (renameMap[serializedConnector1[0]]) {
                targetPort = renameMap[serializedConnector1[0]];
            } else {
                targetPort = serializedConnector1[0];
            }

        } else {
            console.log("Bad connection");
        }
        linksArray.push({
            sourceUuid: sourceUuid,
            targetUuid: targetUuid,
            sourcePortName: sourcePort,
            targetPortName: targetPort
        });

    }

    var result = {
        nodes: processorArray,
        links: linksArray,
        settings: {}
    };

    if (flowName) {
        result.name = flowName;
    } else {
        result.name = "unnamed-flow";
    }
    var json = JSON.stringify(result);
    console.log(JSON.stringify(result));
    return json;
}

function setupTopicBlocksJs(topicList) {
    var template;
    var blockData;
    var fields;
    var outputName;

    for (var i = 0; i < topicList.length; i++) {
        fields = [];
        blockData = {
            name: topicList[i].name,
            description: "Kafka Topic",
            family: "Topics"
        };

        // Fix names and add to the rename map so that we can fix later
        //outputName = replaceall(topicList[i], ".", "-");
        outputName = sanitize(topicList[i].name);
        renameMap[outputName] = topicList[i].name;

        fields.push({
            name: outputName,
            type: "string",
            attrs: "input",
            topicName: topicList[i].name

        });

        fields.push({
            name: outputName,
            type: "string",
            attrs: "output",
            topicName: topicList[i].name

        });

        fields.push({
            name: "outputCloud",
            defaultValue: topicList[i].cloud,
            type: "string",
            attrs: "editable"
        });

        fields.push({
            name: "deployable",
            type: "boolean",
            value: false
        });
        blockData.fields = fields;

        // Dummy template
        templateMap[topicList[i].name] = {
            displayName: "",
            imageName: "none",
            templateId: "none",
            name: topicList[i].name,
            transport: "kafka",
            uuid: "none",
            processorType: "TOPIC_ENDPOINT",
            inputs: [
                topicList[i].name
            ],
            outputs: [
                topicList[i].name
            ]

        };
        blocks.register(blockData);
    }
    console.log("Loaded topics")
}


function setupBlocksJs(nodeYamlList) {
    var template;
    var blockData;
    var fields;
    var inputName;
    var outputName;

    for (var i = 0; i < nodeYamlList.length; i++) {

        template = nodeYamlList[i].spec;
        template.name = template.displayName;
        template.id = nodeYamlList[i].metadata.name;
        template.deployable = true;

        fields = new Array();
        blockData = {
            name: template.name,
            description: template.description,
            family: "Processors"
        };

        // Keep this for saving
        templateMap[template.name] = template;
        templateMap[template.name].processorType = "DEPLOYABLE_IMAGE";

        /* ADD SETTINGS
         var fields = new Array();
         block = this.blockRegistry.createBlock(blockTemplate.name);
         if (blockTemplate.defaults) {
         this.addBlockDefaults(blockTemplate, fields);
         }
         */

        // ADD INPUTS
        if (template.inputs) {
            for (var j = 0; j < template.inputs.length; j++) {
                inputName = sanitize(template.inputs[j]);
                renameMap[inputName] = template.inputs[j];
                fields.push({
                    name: inputName,
                    type: "string",
                    attrs: "input"
                });
            }
        }

        // ADD OUTPUTS
        if (template.outputs) {
            for (var j = 0; j < template.outputs.length; j++) {
                outputName = sanitize(template.outputs[j]);
                renameMap[outputName] = template.outputs[j];
                fields.push({
                    name: outputName,
                    type: "string",
                    attrs: "output"
                });
            }
        }

        // ADD SETTINGS
        var value;
        var key;
        if (template.settings) {
            var keys = Object.keys(template.settings);

            for (var j = 0; j < keys.length; j++) {
                key = keys[j];
                value = template.settings[key];
                fields.push({
                    name: key,
                    defaultValue: value,
                    type: "string",
                    attrs: "editable"
                });
            }
        }

        // ADD DEPLOYMENT DATA
        var cloudName;
        for (var j = 0; j < clouds.length; j++) {
            cloudName = clouds[j];
            if (cloudName === "local") {
                // Default is 1-local
                fields.push({
                    name: "replicas_" + cloudName,
                    defaultValue: 1,
                    type: "integer",
                    attrs: " editable"
                });
            } else {
                // Nothing for anywhere else
                fields.push({
                    name: "replicas_" + cloudName,
                    defaultValue: 0,
                    type: "integer",
                    attrs: " editable"
                });
            }
        }

        fields.push({
            name: "outputCloud",
            defaultValue: "",
            type: "string",
            attrs: " editable"
        });

        blockData.fields = fields;
        console.log(JSON.stringify(blockData));
        blocks.register(blockData);
        console.log("Template: " + i);
    }
}

function fetchTopicList(callback) {
    return $.ajax({
        url: "rest/api/topics",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

function fetchNodeYaml(callback) {

    return $.ajax({
        url: "rest/api/processors",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

function fetchClouds(callback) {
    return $.ajax({
        url: "rest/api/clouds/names",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

// THIS ISN'T A GUID
function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();

}

function sanitize(str) {
    str = replaceall(str, "_", "-");
    str = replaceall(str, ".", "-");
    return str;
}

function replaceall(str, replace, with_this) {
    var str_hasil = "";
    var temp;

    for (var i = 0; i < str.length; i++) // not need to be equal. it causes the last change: undefined..
    {
        if (str[i] == replace) {
            temp = with_this;
        } else {
            temp = str[i];
        }

        str_hasil += temp;
    }

    return str_hasil;
}
