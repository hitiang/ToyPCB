/**
 * PCB at Home - Configuration & Constants
 */
var PCB = PCB || {};

PCB.Config = {
    // Grid unit in mm (1/20 inch)
    GRID_UNIT: 1.27,

    // Default PCB thickness in mm
    DEFAULT_THICKNESS: 2,

    // Circuit trace height (embedded into base, flush with surface) in mm
    TRACE_HEIGHT: 0.5,

    // Groove defaults (mm)
    DEFAULT_GROOVE_WIDTH: 0.8,
    DEFAULT_GROOVE_DEPTH: 0.7,
    DEFAULT_GROOVE_SPACING: 0.4,
    DEFAULT_TRACE_GAP: 0.4,
    DEFAULT_TRACE_FENCE: 0.4,

    // Default circuit width in mm
    DEFAULT_CIRCUIT_WIDTH: 2,

    // Default via diameter in mm
    DEFAULT_VIA_DIAMETER: 1,

    // Scroll adjustment step for width/diameter (mm)
    SCROLL_ADJUST_STEP: 0.1,

    // Via circle approximation segments
    VIA_SEGMENTS: 24,

    // Rendering
    GRID_COLOR: '#e0e0e0',
    GRID_MAJOR_COLOR: '#b0b0b0',
    GRID_MAJOR_INTERVAL: 10,
    BOUNDARY_COLOR: '#ff6600',
    CIRCUIT_FRONT_COLOR: '#cc0000',
    CIRCUIT_BACK_COLOR: '#0066cc',
    VIA_COLOR: '#009900',
    SELECTION_COLOR: '#ff00ff',
    BACKGROUND_COLOR: '#ffffff',
    CANVAS_BG_COLOR: '#f5f5f5',

    // Interaction
    HIT_TOLERANCE: 5,        // pixels
    ENDPOINT_RADIUS: 6,      // pixels
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 50,
    ZOOM_STEP: 1.15,
    DEFAULT_ZOOM: 10,        // pixels per grid unit

    // View modes
    VIEW_FRONT: 'front',
    VIEW_BACK: 'back',
    VIEW_BOTH: 'both',

    // Sides
    SIDE_FRONT: 'front',
    SIDE_BACK: 'back',

    // Tool types
    TOOL_SELECT: 'select',
    TOOL_BOUNDARY: 'boundary',
    TOOL_CIRCUIT: 'circuit',
    TOOL_VIA: 'via'
};
