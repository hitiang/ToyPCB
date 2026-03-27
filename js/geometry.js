/**
 * PCB at Home - Geometry Utilities
 */
var PCB = PCB || {};

PCB.Geometry = (function () {
    /**
     * Calculate signed area of a polygon (positive = CCW)
     */
    function polygonArea(points) {
        var n = points.length;
        var area = 0;
        for (var i = 0; i < n; i++) {
            var j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }

    /**
     * Ensure polygon is in CCW order
     */
    function ensureCCW(points) {
        if (polygonArea(points) < 0) {
            return points.slice().reverse();
        }
        return points.slice();
    }

    /**
     * Ensure polygon is in CW order
     */
    function ensureCW(points) {
        if (polygonArea(points) > 0) {
            return points.slice().reverse();
        }
        return points.slice();
    }

    /**
     * Cross product of vectors (p1->p2) and (p1->p3)
     */
    function cross(p1, p2, p3) {
        return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    }

    /**
     * Check if point is inside a triangle
     */
    function pointInTriangle(p, a, b, c) {
        var d1 = cross(a, b, p);
        var d2 = cross(b, c, p);
        var d3 = cross(c, a, p);
        var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(hasNeg && hasPos);
    }

    /**
     * Point-in-polygon test using ray casting
     */
    function pointInPolygon(point, polygon) {
        var x = point.x, y = point.y;
        var inside = false;
        var n = polygon.length;
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var xi = polygon[i].x, yi = polygon[i].y;
            var xj = polygon[j].x, yj = polygon[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Distance from point to line segment
     */
    function pointToSegmentDist(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            dx = px - x1;
            dy = py - y1;
            return Math.sqrt(dx * dx + dy * dy);
        }
        var t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        var closestX = x1 + t * dx;
        var closestY = y1 + t * dy;
        dx = px - closestX;
        dy = py - closestY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Distance from point to point
     */
    function pointDist(x1, y1, x2, y2) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Build ordered polygon from boundary line segments.
     * Returns array of {x, y} points forming a closed polygon, or null if not closed.
     */
    function buildPolygonFromSegments(segments) {
        if (segments.length === 0) return null;

        // Build adjacency: map from point key to list of segments
        var eps = 0.01;
        function ptKey(x, y) {
            return Math.round(x) + ',' + Math.round(y);
        }

        // Collect all unique points and build graph
        var adj = {};
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var k1 = ptKey(seg.x1, seg.y1);
            var k2 = ptKey(seg.x2, seg.y2);
            if (!adj[k1]) adj[k1] = [];
            if (!adj[k2]) adj[k2] = [];
            adj[k1].push({ key: k2, x: seg.x2, y: seg.y2, idx: i });
            adj[k2].push({ key: k1, x: seg.x1, y: seg.y1, idx: i });
        }

        // Check that all vertices have degree 2
        for (var key in adj) {
            if (adj[key].length !== 2) return null;
        }

        // Walk the polygon
        var startSeg = segments[0];
        var startKey = ptKey(startSeg.x1, startSeg.y1);
        var polygon = [{ x: startSeg.x1, y: startSeg.y1 }];
        var visited = {};
        visited[0] = true;
        var currentKey = ptKey(startSeg.x2, startSeg.y2);
        polygon.push({ x: startSeg.x2, y: startSeg.y2 });

        while (currentKey !== startKey) {
            var neighbors = adj[currentKey];
            var found = false;
            for (var ni = 0; ni < neighbors.length; ni++) {
                var nb = neighbors[ni];
                if (!visited[nb.idx]) {
                    visited[nb.idx] = true;
                    currentKey = nb.key;
                    polygon.push({ x: nb.x, y: nb.y });
                    found = true;
                    break;
                }
            }
            if (!found) return null;
        }

        // Remove the last point (same as first)
        polygon.pop();

        if (polygon.length < 3) return null;
        if (Object.keys(visited).length !== segments.length) return null;

        return polygon;
    }

    /**
     * Create a line width polygon (rectangle around a line segment with given width)
     * Returns 4 corner points in CCW order
     */
    function lineWidthRect(x1, y1, x2, y2, width) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) return null;
        var nx = -dy / len * width / 2;
        var ny = dx / len * width / 2;
        // Return in CCW order (when viewed from +z)
        return [
            { x: x1 - nx, y: y1 - ny },
            { x: x2 - nx, y: y2 - ny },
            { x: x2 + nx, y: y2 + ny },
            { x: x1 + nx, y: y1 + ny }
        ];
    }

    return {
        polygonArea: polygonArea,
        ensureCCW: ensureCCW,
        ensureCW: ensureCW,
        cross: cross,
        pointInTriangle: pointInTriangle,
        pointInPolygon: pointInPolygon,
        pointToSegmentDist: pointToSegmentDist,
        pointDist: pointDist,
        buildPolygonFromSegments: buildPolygonFromSegments,
        lineWidthRect: lineWidthRect
    };
})();
