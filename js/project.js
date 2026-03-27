/**
 * PCB at Home - Project Save/Load
 */
var PCB = PCB || {};

PCB.Project = (function () {

    /**
     * Serialize project to JSON string.
     */
    function serialize(elements, pcbThickness, options) {
        var data = {
            version: 1,
            pcbThickness: pcbThickness,
            enableGrooves: options && options.enableGrooves !== undefined ? options.enableGrooves : true,
            elements: elements.map(function (e) { return e.toJSON(); })
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserialize project from JSON string.
     * Returns { elements, pcbThickness } or { error }.
     */
    function deserialize(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);
            if (!data.elements || !Array.isArray(data.elements)) {
                return { error: PCB.I18n.t('errInvalidFormat') };
            }

            var elements = [];
            var maxId = 0;
            for (var i = 0; i < data.elements.length; i++) {
                var elem = PCB.Elements.fromJSON(data.elements[i]);
                if (elem) {
                    elements.push(elem);
                    if (elem.id > maxId) maxId = elem.id;
                }
            }
            PCB.Elements.resetIdCounter(maxId);

            return {
                elements: elements,
                pcbThickness: data.pcbThickness || PCB.Config.DEFAULT_THICKNESS,
                enableGrooves: data.enableGrooves !== undefined ? data.enableGrooves : true
            };
        } catch (e) {
            return { error: PCB.I18n.t('errParseJson') + e.message };
        }
    }

    /**
     * Download a string as a file.
     */
    function downloadText(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType || 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download an ArrayBuffer as a file.
     */
    function downloadBuffer(buffer, filename, mimeType) {
        var blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Save project: download as JSON file.
     */
    function saveProject(elements, pcbThickness, options) {
        var json = serialize(elements, pcbThickness, options);
        downloadText(json, 'pcb_project.json', 'application/json');
    }

    /**
     * Open project from file input.
     */
    function openProjectFromFile(file, callback) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var result = deserialize(e.target.result);
            callback(result);
        };
        reader.readAsText(file);
    }

    /**
     * Open project from textarea content.
     */
    function openProjectFromText(text, callback) {
        var result = deserialize(text);
        callback(result);
    }

    /**
     * Export STL: download as STL file.
     */
    function exportSTL(elements, opts) {
        var result = PCB.STL.exportSTL(elements, opts);
        if (result.error) {
            alert('STL Export Error:\n' + result.error);
            return;
        }
        downloadBuffer(result.buffer, 'pcb_board.stl', 'model/stl');
    }

    /**
     * Download STL buffer directly.
     */
    function downloadSTL(buffer) {
        downloadBuffer(buffer, 'pcb_board.stl', 'model/stl');
    }

    return {
        serialize: serialize,
        deserialize: deserialize,
        saveProject: saveProject,
        openProjectFromFile: openProjectFromFile,
        openProjectFromText: openProjectFromText,
        exportSTL: exportSTL,
        downloadSTL: downloadSTL
    };
})();
