/**
 * PCB at Home - Drawing Tools
 */
var PCB = PCB || {};

PCB.Tools = (function () {
    var currentTool = PCB.Config.TOOL_SELECT;
    var selectedElementId = null;
    var dragging = false;
    var dragEndpoint = 0;  // 0 = whole, 1 = endpoint1, 2 = endpoint2
    var dragStartGridX = 0, dragStartGridY = 0;
    var dragElemStartX1 = 0, dragElemStartY1 = 0;
    var dragElemStartX2 = 0, dragElemStartY2 = 0;
    var dragElemStartCX = 0, dragElemStartCY = 0;
    var panning = false;
    var panStartX = 0, panStartY = 0;
    var panStartPanX = 0, panStartPanY = 0;

    // Drawing state
    var drawingFirstPoint = false;
    var drawStartX = 0, drawStartY = 0;
    var previewData = { active: false, x1: 0, y1: 0, x2: 0, y2: 0, toolType: '', width: 0 };

    // Defaults
    var defaultCircuitWidth = PCB.Config.DEFAULT_CIRCUIT_WIDTH;
    var defaultViaDiameter = PCB.Config.DEFAULT_VIA_DIAMETER;

    // Element store reference (set by app)
    var elements = [];
    var onChanged = null;
    var onCommit = null;  // called only when an edit action is finalized

    function setElements(elems) { elements = elems; }
    function getElements() { return elements; }
    function setOnChanged(fn) { onChanged = fn; }
    function setOnCommit(fn) { onCommit = fn; }

    function getCurrentTool() { return currentTool; }
    function setCurrentTool(tool) {
        currentTool = tool;
        cancelDrawing();
    }

    function getSelectedElementId() { return selectedElementId; }
    function getSelectedElement() {
        if (!selectedElementId) return null;
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].id === selectedElementId) return elements[i];
        }
        return null;
    }

    function setSelectedElementId(id) { selectedElementId = id; }

    function getPreviewData() { return previewData; }

    function getDefaultCircuitWidth() { return defaultCircuitWidth; }
    function setDefaultCircuitWidth(w) { defaultCircuitWidth = w; }
    function getDefaultViaDiameter() { return defaultViaDiameter; }
    function setDefaultViaDiameter(d) { defaultViaDiameter = d; }

    function cancelDrawing() {
        drawingFirstPoint = false;
        previewData.active = false;
    }

    function deleteSelected() {
        if (!selectedElementId) return;
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].id === selectedElementId) {
                elements.splice(i, 1);
                selectedElementId = null;
                if (onCommit) onCommit();
                if (onChanged) onChanged();
                return;
            }
        }
    }

    function findElementAt(gx, gy, viewport) {
        var toleranceGrid = PCB.Config.HIT_TOLERANCE / PCB.Renderer.getZoom();
        var isFrontView = !viewport.flip;

        // Search in reverse order (top elements first)
        for (var i = elements.length - 1; i >= 0; i--) {
            var elem = elements[i];
            // Filter by view
            if (elem.type === 'circuit') {
                if (isFrontView && elem.side !== PCB.Config.SIDE_FRONT) continue;
                if (!isFrontView && elem.side !== PCB.Config.SIDE_BACK) continue;
            }
            if (elem.hitTest(gx, gy, toleranceGrid)) {
                return elem;
            }
        }
        return null;
    }

    // ---- Mouse Event Handlers ----

    function onMouseDown(e) {
        var canvas = PCB.Renderer.getCanvas();
        var rect = canvas.getBoundingClientRect();
        var sx = e.clientX - rect.left;
        var sy = e.clientY - rect.top;

        // Middle button or right button: panning
        if (e.button === 1 || e.button === 2) {
            panning = true;
            panStartX = sx;
            panStartY = sy;
            var pan = PCB.Renderer.getPan();
            panStartPanX = pan.x;
            panStartPanY = pan.y;
            e.preventDefault();
            return;
        }

        var vp = PCB.Renderer.hitViewport(sx, sy);
        var grid = PCB.Renderer.screenToGrid(sx, sy, vp);
        var gx = PCB.Renderer.snapToGrid(grid.x);
        var gy = PCB.Renderer.snapToGrid(grid.y);

        if (currentTool === PCB.Config.TOOL_SELECT) {
            handleSelectMouseDown(gx, gy, grid.x, grid.y, vp);
        } else if (currentTool === PCB.Config.TOOL_BOUNDARY || currentTool === PCB.Config.TOOL_CIRCUIT) {
            handleLineToolMouseDown(gx, gy, vp);
        } else if (currentTool === PCB.Config.TOOL_VIA) {
            handleViaToolMouseDown(gx, gy, vp);
        }
    }

    function handleSelectMouseDown(gx, gy, rawGx, rawGy, vp) {
        var toleranceGrid = PCB.Config.HIT_TOLERANCE / PCB.Renderer.getZoom();

        // First check if clicking on a selected element's endpoint
        var selElem = getSelectedElement();
        if (selElem && (selElem.type === 'boundary' || selElem.type === 'circuit')) {
            var ep = selElem.hitEndpoint(rawGx, rawGy, toleranceGrid * 1.5);
            if (ep > 0) {
                dragging = true;
                dragEndpoint = ep;
                dragStartGridX = gx;
                dragStartGridY = gy;
                dragElemStartX1 = selElem.x1;
                dragElemStartY1 = selElem.y1;
                dragElemStartX2 = selElem.x2;
                dragElemStartY2 = selElem.y2;
                return;
            }
        }

        // Find element under cursor
        var elem = findElementAt(rawGx, rawGy, vp);
        if (elem) {
            selectedElementId = elem.id;
            dragging = true;
            dragEndpoint = 0;
            dragStartGridX = gx;
            dragStartGridY = gy;
            if (elem.type === 'via') {
                dragElemStartCX = elem.cx;
                dragElemStartCY = elem.cy;
            } else {
                dragElemStartX1 = elem.x1;
                dragElemStartY1 = elem.y1;
                dragElemStartX2 = elem.x2;
                dragElemStartY2 = elem.y2;
            }
        } else {
            selectedElementId = null;
        }
        if (onChanged) onChanged();
    }

    function handleLineToolMouseDown(gx, gy, vp) {
        // Start drag-to-draw mode
        drawingFirstPoint = true;
        drawStartX = gx;
        drawStartY = gy;
        previewData.active = true;
        previewData.x1 = gx;
        previewData.y1 = gy;
        previewData.x2 = gx;
        previewData.y2 = gy;
        previewData.toolType = currentTool;
        previewData.width = defaultCircuitWidth;
        previewData.viewport = vp;
    }

    function handleViaToolMouseDown(gx, gy, vp) {
        var elem = new PCB.Elements.Via(gx, gy, defaultViaDiameter);
        elements.push(elem);
        selectedElementId = elem.id;
        if (onCommit) onCommit();
        if (onChanged) onChanged();
    }

    function onMouseMove(e) {
        var canvas = PCB.Renderer.getCanvas();
        var rect = canvas.getBoundingClientRect();
        var sx = e.clientX - rect.left;
        var sy = e.clientY - rect.top;

        if (panning) {
            var dx = sx - panStartX;
            var dy = sy - panStartY;
            PCB.Renderer.setPan(panStartPanX + dx, panStartPanY + dy);
            if (onChanged) onChanged();
            return;
        }

        var vp = PCB.Renderer.hitViewport(sx, sy);
        var grid = PCB.Renderer.screenToGrid(sx, sy, vp);
        var gx = PCB.Renderer.snapToGrid(grid.x);
        var gy = PCB.Renderer.snapToGrid(grid.y);

        // Update coordinate display
        updateCoordDisplay(gx, gy);

        if (dragging && currentTool === PCB.Config.TOOL_SELECT) {
            var elem = getSelectedElement();
            if (!elem) return;

            var dx = gx - dragStartGridX;
            var dy = gy - dragStartGridY;

            if (elem.type === 'via') {
                elem.cx = dragElemStartCX + dx;
                elem.cy = dragElemStartCY + dy;
            } else if (dragEndpoint === 1) {
                elem.x1 = dragElemStartX1 + dx;
                elem.y1 = dragElemStartY1 + dy;
            } else if (dragEndpoint === 2) {
                elem.x2 = dragElemStartX2 + dx;
                elem.y2 = dragElemStartY2 + dy;
            } else {
                elem.x1 = dragElemStartX1 + dx;
                elem.y1 = dragElemStartY1 + dy;
                elem.x2 = dragElemStartX2 + dx;
                elem.y2 = dragElemStartY2 + dy;
            }

            if (onChanged) onChanged();
        }

        // Update preview
        if (drawingFirstPoint) {
            previewData.x2 = gx;
            previewData.y2 = gy;
            if (onChanged) onChanged();
        }
    }

    function onMouseUp(e) {
        if (panning) {
            panning = false;
            return;
        }

        // Complete line drawing on mouse up
        if (drawingFirstPoint && (currentTool === PCB.Config.TOOL_BOUNDARY || currentTool === PCB.Config.TOOL_CIRCUIT)) {
            var canvas = PCB.Renderer.getCanvas();
            var rect = canvas.getBoundingClientRect();
            var sx = e.clientX - rect.left;
            var sy = e.clientY - rect.top;
            var vp = PCB.Renderer.hitViewport(sx, sy);
            var grid = PCB.Renderer.screenToGrid(sx, sy, vp);
            var gx = PCB.Renderer.snapToGrid(grid.x);
            var gy = PCB.Renderer.snapToGrid(grid.y);

            // If dragged, create element
            if (gx !== drawStartX || gy !== drawStartY) {
                var elem;
                if (currentTool === PCB.Config.TOOL_BOUNDARY) {
                    elem = new PCB.Elements.BoundaryLine(drawStartX, drawStartY, gx, gy);
                } else {
                    var side = (previewData.viewport && previewData.viewport.flip) ? PCB.Config.SIDE_BACK : PCB.Config.SIDE_FRONT;
                    elem = new PCB.Elements.CircuitLine(drawStartX, drawStartY, gx, gy, defaultCircuitWidth, side);
                }
                elements.push(elem);
                selectedElementId = elem.id;
                if (onCommit) onCommit();
            } else {
                // If clicked without drag, try to select element at cursor
                var elem = findElementAt(grid.x, grid.y, vp);
                if (elem) {
                    selectedElementId = elem.id;
                } else {
                    selectedElementId = null;
                }
            }
            cancelDrawing();
            if (onChanged) onChanged();
        }

        // Commit drag move
        if (dragging) {
            if (onCommit) onCommit();
        }

        dragging = false;
        dragEndpoint = 0;
    }

    function onWheel(e) {
        e.preventDefault();

        // If a circuit or via is selected, adjust its width/diameter
        var selElem = getSelectedElement();
        if (selElem && (selElem.type === 'circuit' || selElem.type === 'via')) {
            var step = PCB.Config.SCROLL_ADJUST_STEP;
            var delta = e.deltaY < 0 ? step : -step;
            if (selElem.type === 'circuit') {
                selElem.width = Math.max(step, Math.round((selElem.width + delta) * 10) / 10);
            } else {
                selElem.diameter = Math.max(step, Math.round((selElem.diameter + delta) * 10) / 10);
            }
            if (onCommit) onCommit();
            if (onChanged) onChanged();
            return;
        }

        // Otherwise zoom
        var canvas = PCB.Renderer.getCanvas();
        var rect = canvas.getBoundingClientRect();
        var sx = e.clientX - rect.left;
        var sy = e.clientY - rect.top;
        var factor = e.deltaY < 0 ? PCB.Config.ZOOM_STEP : (1 / PCB.Config.ZOOM_STEP);
        PCB.Renderer.zoomAt(sx, sy, factor);
        if (onChanged) onChanged();
    }

    function onKeyDown(e) {
        // Skip shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelected();
        }
        if (e.key === 'Escape') {
            if (drawingFirstPoint) {
                cancelDrawing();
            } else if (currentTool !== PCB.Config.TOOL_SELECT) {
                currentTool = PCB.Config.TOOL_SELECT;
                selectedElementId = null;
            } else {
                selectedElementId = null;
            }
            if (onChanged) onChanged();
        }
        var key = e.key.toLowerCase();
        if (key === 'm') { setCurrentTool(PCB.Config.TOOL_SELECT); if (onChanged) onChanged(); }
        if (key === 'b') { setCurrentTool(PCB.Config.TOOL_BOUNDARY); if (onChanged) onChanged(); }
        if (key === 'c') { setCurrentTool(PCB.Config.TOOL_CIRCUIT); if (onChanged) onChanged(); }
        if (key === 'v') { setCurrentTool(PCB.Config.TOOL_VIA); if (onChanged) onChanged(); }
    }

    function updateCoordDisplay(gx, gy) {
        var coordEl = document.getElementById('coord-display');
        if (coordEl) {
            var mmX = (gx * PCB.Config.GRID_UNIT).toFixed(2);
            var mmY = (gy * PCB.Config.GRID_UNIT).toFixed(2);
            var text = PCB.I18n.t('coordGrid') + ' (' + gx + ', ' + gy + ')  |  ' + PCB.I18n.t('coordMm') + ' (' + mmX + ', ' + mmY + ')';

            // Show length during drawing
            if (drawingFirstPoint && previewData) {
                var dx = (previewData.x2 - previewData.x1) * PCB.Config.GRID_UNIT;
                var dy = (previewData.y2 - previewData.y1) * PCB.Config.GRID_UNIT;
                var length = Math.sqrt(dx * dx + dy * dy);
                text += '  |  ' + PCB.I18n.t('coordLength') + ' ' + length.toFixed(2) + 'mm';
            }

            coordEl.textContent = text;
        }
    }

    return {
        setElements: setElements,
        getElements: getElements,
        setOnChanged: setOnChanged,
        setOnCommit: setOnCommit,
        getCurrentTool: getCurrentTool,
        setCurrentTool: setCurrentTool,
        getSelectedElementId: getSelectedElementId,
        getSelectedElement: getSelectedElement,
        setSelectedElementId: setSelectedElementId,
        getPreviewData: getPreviewData,
        getDefaultCircuitWidth: getDefaultCircuitWidth,
        setDefaultCircuitWidth: setDefaultCircuitWidth,
        getDefaultViaDiameter: getDefaultViaDiameter,
        setDefaultViaDiameter: setDefaultViaDiameter,
        deleteSelected: deleteSelected,
        cancelDrawing: cancelDrawing,
        onMouseDown: onMouseDown,
        onMouseMove: onMouseMove,
        onMouseUp: onMouseUp,
        onWheel: onWheel,
        onKeyDown: onKeyDown
    };
})();
