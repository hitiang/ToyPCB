/**
 * PCB at Home - Canvas Renderer
 */
var PCB = PCB || {};

PCB.Renderer = (function () {
    var canvas, ctx;
    var zoom = PCB.Config.DEFAULT_ZOOM;
    var panX = 0, panY = 0;
    var viewMode = PCB.Config.VIEW_BOTH;

    function init(canvasId) {
        canvas = document.getElementById(canvasId);
        ctx = canvas.getContext('2d');
        resize();
    }

    function resize() {
        var container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    function getCanvas() { return canvas; }
    function getZoom() { return zoom; }
    function setZoom(z) { zoom = Math.max(PCB.Config.MIN_ZOOM, Math.min(PCB.Config.MAX_ZOOM, z)); }
    function getPan() { return { x: panX, y: panY }; }
    function setPan(x, y) { panX = x; panY = y; }
    function getViewMode() { return viewMode; }
    function setViewMode(mode) { viewMode = mode; }

    /** Convert grid coordinates to screen coordinates for a given viewport */
    function gridToScreen(gx, gy, viewport) {
        var ox = viewport ? viewport.x : 0;
        var oy = viewport ? viewport.y : 0;
        var flip = viewport ? viewport.flip : false;
        var vw = viewport ? viewport.w : canvas.width;

        var sx, sy;
        if (flip) {
            sx = ox + vw - (gx * zoom + panX);
        } else {
            sx = ox + gx * zoom + panX;
        }
        sy = oy + gy * zoom + panY;
        return { x: sx, y: sy };
    }

    /** Convert screen coordinates to grid coordinates for a given viewport */
    function screenToGrid(sx, sy, viewport) {
        var ox = viewport ? viewport.x : 0;
        var oy = viewport ? viewport.y : 0;
        var flip = viewport ? viewport.flip : false;
        var vw = viewport ? viewport.w : canvas.width;

        var gx, gy;
        if (flip) {
            gx = (ox + vw - sx - panX) / zoom;
        } else {
            gx = (sx - ox - panX) / zoom;
        }
        gy = (sy - oy - panY) / zoom;
        return { x: gx, y: gy };
    }

    /** Snap grid coordinate to integer */
    function snapToGrid(val) {
        return Math.round(val);
    }

    /** Get viewport(s) based on current view mode */
    function getViewports() {
        var w = canvas.width;
        var h = canvas.height;
        var gap = 20;

        if (viewMode === PCB.Config.VIEW_BOTH) {
            var halfW = Math.floor((w - gap) / 2);
            return [
                { x: 0, y: 0, w: halfW, h: h, flip: false, label: 'Front' },
                { x: halfW + gap, y: 0, w: halfW, h: h, flip: true, label: 'Back' }
            ];
        } else if (viewMode === PCB.Config.VIEW_FRONT) {
            return [{ x: 0, y: 0, w: w, h: h, flip: false, label: 'Front' }];
        } else {
            return [{ x: 0, y: 0, w: w, h: h, flip: true, label: 'Back' }];
        }
    }

    /** Determine which viewport screen coordinates falls in */
    function hitViewport(sx, sy) {
        var viewports = getViewports();
        for (var i = 0; i < viewports.length; i++) {
            var vp = viewports[i];
            if (sx >= vp.x && sx < vp.x + vp.w && sy >= vp.y && sy < vp.y + vp.h) {
                return vp;
            }
        }
        return viewports[0];
    }

    /** Draw the grid for a viewport */
    function drawGrid(vp) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(vp.x, vp.y, vp.w, vp.h);
        ctx.clip();

        ctx.fillStyle = PCB.Config.BACKGROUND_COLOR;
        ctx.fillRect(vp.x, vp.y, vp.w, vp.h);

        // Calculate visible grid range
        var topLeft = screenToGrid(vp.x, vp.y, vp);
        var bottomRight = screenToGrid(vp.x + vp.w, vp.y + vp.h, vp);

        var minGX = Math.floor(Math.min(topLeft.x, bottomRight.x)) - 1;
        var maxGX = Math.ceil(Math.max(topLeft.x, bottomRight.x)) + 1;
        var minGY = Math.floor(topLeft.y) - 1;
        var maxGY = Math.ceil(bottomRight.y) + 1;

        // Only draw grid if zoom is large enough
        if (zoom >= 3) {
            ctx.lineWidth = 0.5;

            for (var gx = minGX; gx <= maxGX; gx++) {
                var isMajor = (gx % PCB.Config.GRID_MAJOR_INTERVAL === 0);
                ctx.strokeStyle = isMajor ? PCB.Config.GRID_MAJOR_COLOR : PCB.Config.GRID_COLOR;
                ctx.beginPath();
                var s1 = gridToScreen(gx, minGY, vp);
                var s2 = gridToScreen(gx, maxGY, vp);
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            }

            for (var gy = minGY; gy <= maxGY; gy++) {
                var isMajor = (gy % PCB.Config.GRID_MAJOR_INTERVAL === 0);
                ctx.strokeStyle = isMajor ? PCB.Config.GRID_MAJOR_COLOR : PCB.Config.GRID_COLOR;
                ctx.beginPath();
                var s1 = gridToScreen(minGX, gy, vp);
                var s2 = gridToScreen(maxGX, gy, vp);
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            }
        }

        // Draw origin crosshair
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        var o = gridToScreen(0, 0, vp);
        ctx.beginPath();
        ctx.moveTo(o.x - 10, o.y);
        ctx.lineTo(o.x + 10, o.y);
        ctx.moveTo(o.x, o.y - 10);
        ctx.lineTo(o.x, o.y + 10);
        ctx.stroke();

        // Draw viewport label
        ctx.fillStyle = '#666';
        ctx.font = '14px sans-serif';
        ctx.fillText(vp.label, vp.x + 10, vp.y + 22);

        ctx.restore();
    }

    /** Draw a boundary line */
    function drawBoundary(elem, vp, selected) {
        var s1 = gridToScreen(elem.x1, elem.y1, vp);
        var s2 = gridToScreen(elem.x2, elem.y2, vp);

        ctx.strokeStyle = selected ? PCB.Config.SELECTION_COLOR : PCB.Config.BOUNDARY_COLOR;
        ctx.lineWidth = selected ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();

        if (selected) {
            drawEndpoint(s1.x, s1.y);
            drawEndpoint(s2.x, s2.y);
        }
    }

    /** Draw a circuit line */
    function drawCircuit(elem, vp, selected) {
        var s1 = gridToScreen(elem.x1, elem.y1, vp);
        var s2 = gridToScreen(elem.x2, elem.y2, vp);
        var widthPx = (elem.width / PCB.Config.GRID_UNIT) * zoom;

        var color;
        if (selected) {
            color = PCB.Config.SELECTION_COLOR;
        } else if (elem.side === PCB.Config.SIDE_FRONT) {
            color = PCB.Config.CIRCUIT_FRONT_COLOR;
        } else {
            color = PCB.Config.CIRCUIT_BACK_COLOR;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(widthPx, 1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.lineCap = 'butt';

        if (selected) {
            drawEndpoint(s1.x, s1.y);
            drawEndpoint(s2.x, s2.y);
        }
    }

    /** Draw a via */
    function drawVia(elem, vp, selected) {
        var sc = gridToScreen(elem.cx, elem.cy, vp);
        var radiusPx = (elem.diameter / 2 / PCB.Config.GRID_UNIT) * zoom;

        ctx.strokeStyle = selected ? PCB.Config.SELECTION_COLOR : PCB.Config.VIA_COLOR;
        ctx.lineWidth = selected ? 2.5 : 2;
        ctx.fillStyle = selected ? 'rgba(255,0,255,0.15)' : 'rgba(0,153,0,0.15)';
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, Math.max(radiusPx, 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw cross
        ctx.beginPath();
        ctx.moveTo(sc.x - 3, sc.y);
        ctx.lineTo(sc.x + 3, sc.y);
        ctx.moveTo(sc.x, sc.y - 3);
        ctx.lineTo(sc.x, sc.y + 3);
        ctx.stroke();
    }

    /** Draw endpoint handle */
    function drawEndpoint(sx, sy) {
        ctx.fillStyle = PCB.Config.SELECTION_COLOR;
        ctx.beginPath();
        ctx.arc(sx, sy, PCB.Config.ENDPOINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Draw preview line during drawing */
    function drawPreview(gx1, gy1, gx2, gy2, toolType, vp, width) {
        var s1 = gridToScreen(gx1, gy1, vp);
        var s2 = gridToScreen(gx2, gy2, vp);

        ctx.save();
        ctx.setLineDash([5, 5]);

        if (toolType === PCB.Config.TOOL_BOUNDARY) {
            ctx.strokeStyle = PCB.Config.BOUNDARY_COLOR;
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = '#888';
            var widthPx = (width / PCB.Config.GRID_UNIT) * zoom;
            ctx.lineWidth = Math.max(widthPx, 1);
        }

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.restore();
    }

    /** Main render function */
    function render(elements, selectedId, previewData) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = PCB.Config.CANVAS_BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var viewports = getViewports();

        for (var vi = 0; vi < viewports.length; vi++) {
            var vp = viewports[vi];
            var isFrontView = !vp.flip;

            ctx.save();
            ctx.beginPath();
            ctx.rect(vp.x, vp.y, vp.w, vp.h);
            ctx.clip();

            drawGrid(vp);

            // Draw elements
            for (var i = 0; i < elements.length; i++) {
                var elem = elements[i];
                var selected = (elem.id === selectedId);

                if (elem.type === 'boundary') {
                    drawBoundary(elem, vp, selected);
                } else if (elem.type === 'circuit') {
                    // Show circuit only on matching side view, or always in both
                    if (isFrontView && elem.side === PCB.Config.SIDE_FRONT) {
                        drawCircuit(elem, vp, selected);
                    } else if (!isFrontView && elem.side === PCB.Config.SIDE_BACK) {
                        drawCircuit(elem, vp, selected);
                    }
                } else if (elem.type === 'via') {
                    drawVia(elem, vp, selected);
                }
            }

            // Draw preview
            if (previewData && previewData.active) {
                drawPreview(previewData.x1, previewData.y1, previewData.x2, previewData.y2,
                    previewData.toolType, vp, previewData.width);
            }

            ctx.restore();
        }

        // Draw separator line for both mode
        if (viewMode === PCB.Config.VIEW_BOTH && viewports.length === 2) {
            var sepX = viewports[0].w + 10;
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sepX, 0);
            ctx.lineTo(sepX, canvas.height);
            ctx.stroke();
        }
    }

    /** Zoom at a specific screen point */
    function zoomAt(sx, sy, factor) {
        var vp = hitViewport(sx, sy);
        var gBefore = screenToGrid(sx, sy, vp);

        zoom *= factor;
        zoom = Math.max(PCB.Config.MIN_ZOOM, Math.min(PCB.Config.MAX_ZOOM, zoom));

        // Adjust pan so the point under the cursor stays in place
        if (vp.flip) {
            panX = vp.x + vp.w - sx - gBefore.x * zoom;
        } else {
            panX = sx - vp.x - gBefore.x * zoom;
        }
        panY = sy - vp.y - gBefore.y * zoom;
    }

    return {
        init: init,
        resize: resize,
        getCanvas: getCanvas,
        getZoom: getZoom,
        setZoom: setZoom,
        getPan: getPan,
        setPan: setPan,
        getViewMode: getViewMode,
        setViewMode: setViewMode,
        gridToScreen: gridToScreen,
        screenToGrid: screenToGrid,
        snapToGrid: snapToGrid,
        getViewports: getViewports,
        hitViewport: hitViewport,
        render: render,
        zoomAt: zoomAt
    };
})();
