/**
 * PCB at Home - Element Classes
 */
var PCB = PCB || {};

PCB.Elements = (function () {
    var idCounter = 0;

    function nextId() {
        return ++idCounter;
    }

    function resetIdCounter(maxId) {
        idCounter = maxId || 0;
    }

    // ---- BoundaryLine ----
    function BoundaryLine(x1, y1, x2, y2) {
        this.id = nextId();
        this.type = 'boundary';
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    BoundaryLine.prototype.hitTest = function (gx, gy, toleranceGrid) {
        var dist = PCB.Geometry.pointToSegmentDist(gx, gy, this.x1, this.y1, this.x2, this.y2);
        return dist <= toleranceGrid;
    };

    BoundaryLine.prototype.hitEndpoint = function (gx, gy, toleranceGrid) {
        var d1 = PCB.Geometry.pointDist(gx, gy, this.x1, this.y1);
        var d2 = PCB.Geometry.pointDist(gx, gy, this.x2, this.y2);
        if (d1 <= toleranceGrid) return 1;
        if (d2 <= toleranceGrid) return 2;
        return 0;
    };

    BoundaryLine.prototype.move = function (dx, dy) {
        this.x1 += dx; this.y1 += dy;
        this.x2 += dx; this.y2 += dy;
    };

    BoundaryLine.prototype.moveEndpoint = function (endpoint, gx, gy) {
        if (endpoint === 1) { this.x1 = gx; this.y1 = gy; }
        else if (endpoint === 2) { this.x2 = gx; this.y2 = gy; }
    };

    BoundaryLine.prototype.toJSON = function () {
        return { type: 'boundary', x1: this.x1, y1: this.y1, x2: this.x2, y2: this.y2 };
    };

    BoundaryLine.fromJSON = function (data) {
        return new BoundaryLine(data.x1, data.y1, data.x2, data.y2);
    };

    // ---- CircuitLine ----
    function CircuitLine(x1, y1, x2, y2, width, side) {
        this.id = nextId();
        this.type = 'circuit';
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.width = width;  // mm
        this.side = side;    // 'front' or 'back'
    }

    CircuitLine.prototype.hitTest = function (gx, gy, toleranceGrid) {
        var dist = PCB.Geometry.pointToSegmentDist(gx, gy, this.x1, this.y1, this.x2, this.y2);
        var halfWidthGrid = (this.width / PCB.Config.GRID_UNIT) / 2;
        return dist <= (halfWidthGrid + toleranceGrid);
    };

    CircuitLine.prototype.hitEndpoint = function (gx, gy, toleranceGrid) {
        var d1 = PCB.Geometry.pointDist(gx, gy, this.x1, this.y1);
        var d2 = PCB.Geometry.pointDist(gx, gy, this.x2, this.y2);
        if (d1 <= toleranceGrid) return 1;
        if (d2 <= toleranceGrid) return 2;
        return 0;
    };

    CircuitLine.prototype.move = function (dx, dy) {
        this.x1 += dx; this.y1 += dy;
        this.x2 += dx; this.y2 += dy;
    };

    CircuitLine.prototype.moveEndpoint = function (endpoint, gx, gy) {
        if (endpoint === 1) { this.x1 = gx; this.y1 = gy; }
        else if (endpoint === 2) { this.x2 = gx; this.y2 = gy; }
    };

    CircuitLine.prototype.toJSON = function () {
        return {
            type: 'circuit', x1: this.x1, y1: this.y1, x2: this.x2, y2: this.y2,
            width: this.width, side: this.side
        };
    };

    CircuitLine.fromJSON = function (data) {
        return new CircuitLine(data.x1, data.y1, data.x2, data.y2, data.width, data.side);
    };

    // ---- Via ----
    function Via(cx, cy, diameter) {
        this.id = nextId();
        this.type = 'via';
        this.cx = cx;
        this.cy = cy;
        this.diameter = diameter;  // mm
    }

    Via.prototype.hitTest = function (gx, gy, toleranceGrid) {
        var dist = PCB.Geometry.pointDist(gx, gy, this.cx, this.cy);
        var radiusGrid = (this.diameter / PCB.Config.GRID_UNIT) / 2;
        return dist <= (radiusGrid + toleranceGrid);
    };

    Via.prototype.hitEndpoint = function () { return 0; };

    Via.prototype.move = function (dx, dy) {
        this.cx += dx;
        this.cy += dy;
    };

    Via.prototype.toJSON = function () {
        return { type: 'via', cx: this.cx, cy: this.cy, diameter: this.diameter };
    };

    Via.fromJSON = function (data) {
        return new Via(data.cx, data.cy, data.diameter);
    };

    // ---- Factory ----
    function fromJSON(data) {
        switch (data.type) {
            case 'boundary': return BoundaryLine.fromJSON(data);
            case 'circuit': return CircuitLine.fromJSON(data);
            case 'via': return Via.fromJSON(data);
            default: return null;
        }
    }

    return {
        BoundaryLine: BoundaryLine,
        CircuitLine: CircuitLine,
        Via: Via,
        fromJSON: fromJSON,
        resetIdCounter: resetIdCounter
    };
})();
