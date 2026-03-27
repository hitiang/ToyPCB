/**
 * PCB at Home - Main Application
 */
var PCB = PCB || {};

PCB.App = (function () {
    var elements = [];
    var renderScheduled = false;
    var previewSTLBuffer = null;

    // History management
    var history = [];
    var historyIndex = -1;
    var MAX_HISTORY = 15;

    /** Parse binary STL ArrayBuffer into a THREE.BufferGeometry */
    function parseBinarySTL(buffer) {
        var dv = new DataView(buffer);
        var numTriangles = dv.getUint32(80, true);
        var vertices = new Float32Array(numTriangles * 9);
        var normals = new Float32Array(numTriangles * 9);
        var offset = 84;
        for (var i = 0; i < numTriangles; i++) {
            var nx = dv.getFloat32(offset, true);
            var ny = dv.getFloat32(offset + 4, true);
            var nz = dv.getFloat32(offset + 8, true);
            offset += 12;
            for (var v = 0; v < 3; v++) {
                var idx = i * 9 + v * 3;
                vertices[idx]     = dv.getFloat32(offset, true);
                vertices[idx + 1] = dv.getFloat32(offset + 4, true);
                vertices[idx + 2] = dv.getFloat32(offset + 8, true);
                normals[idx]     = nx;
                normals[idx + 1] = ny;
                normals[idx + 2] = nz;
                offset += 12;
            }
            offset += 2; // attribute byte count
        }
        var geometry = new THREE.BufferGeometry();
        geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
        return geometry;
    }

    function init() {
        // Initialize renderer
        PCB.Renderer.init('pcb-canvas');

        // Set initial pan to center-ish with some offset
        PCB.Renderer.setPan(150, 150);

        // Set up elements reference
        PCB.Tools.setElements(elements);
        PCB.Tools.setOnChanged(scheduleRender);
        PCB.Tools.setOnCommit(function() {
            saveHistory();
        });

        // Bind UI events
        bindToolButtons();
        bindTopBarButtons();
        bindCanvasEvents();
        bindPropertyPanel();
        bindKeyboard();

        // Language: detect from browser and apply
        var detectedLang = PCB.I18n.detectLanguage();
        var langSelect = document.getElementById('lang-select');
        langSelect.value = detectedLang;
        PCB.I18n.applyLanguage(detectedLang);
        langSelect.addEventListener('change', function () {
            PCB.I18n.applyLanguage(this.value);
        });

        // Handle window resize
        window.addEventListener('resize', function () {
            PCB.Renderer.resize();
            scheduleRender();
        });

        // Prevent context menu on canvas
        var canvas = PCB.Renderer.getCanvas();
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

        // Save initial empty state
        saveHistory();

        // Initial render
        scheduleRender();
    }

    function saveHistory() {
        // Remove future history if we're not at the end
        history.splice(historyIndex + 1);
        // Snapshot using toJSON for each element
        var snapshot = [];
        for (var i = 0; i < elements.length; i++) {
            snapshot.push(elements[i].toJSON ? elements[i].toJSON() : JSON.parse(JSON.stringify(elements[i])));
        }
        history.push(snapshot);
        // Limit history size
        if (history.length > MAX_HISTORY) {
            history.shift();
        } else {
            historyIndex++;
        }
    }

    function showToast(msg) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;border-radius:6px;' +
            'font-size:13px;z-index:999;pointer-events:none;transition:opacity 0.4s;';
        document.body.appendChild(el);
        setTimeout(function () { el.style.opacity = '0'; }, 4600);
        setTimeout(function () { document.body.removeChild(el); }, 5000);
    }

    function restoreSnapshot(snapshot) {
        elements.length = 0;
        var maxId = 0;
        for (var i = 0; i < snapshot.length; i++) {
            var elem = PCB.Elements.fromJSON(snapshot[i]);
            if (elem) {
                elements.push(elem);
                if (elem.id > maxId) maxId = elem.id;
            }
        }
        PCB.Elements.resetIdCounter(maxId);
        PCB.Tools.setElements(elements);
        PCB.Tools.setSelectedElementId(null);
        PCB.Tools.cancelDrawing();
        scheduleRender();
    }

    function undo() {
        if (historyIndex <= 0) {
            showToast(PCB.I18n.t('noUndo'));
            return;
        }
        historyIndex--;
        restoreSnapshot(history[historyIndex]);
    }

    function redo() {
        if (historyIndex >= history.length - 1) {
            showToast(PCB.I18n.t('noRedo'));
            return;
        }
        historyIndex++;
        restoreSnapshot(history[historyIndex]);
    }

    function scheduleRender() {
        if (!renderScheduled) {
            renderScheduled = true;
            requestAnimationFrame(function () {
                renderScheduled = false;
                render();
            });
        }
    }

    function render() {
        PCB.Renderer.render(elements, PCB.Tools.getSelectedElementId(), PCB.Tools.getPreviewData());
        updatePropertyPanel();
        updateToolHighlight();
    }

    // ---- Tool Buttons ----
    function bindToolButtons() {
        document.getElementById('tool-select').addEventListener('click', function () {
            PCB.Tools.setCurrentTool(PCB.Config.TOOL_SELECT);
            scheduleRender();
        });
        document.getElementById('tool-boundary').addEventListener('click', function () {
            PCB.Tools.setCurrentTool(PCB.Config.TOOL_BOUNDARY);
            scheduleRender();
        });
        document.getElementById('tool-circuit').addEventListener('click', function () {
            PCB.Tools.setCurrentTool(PCB.Config.TOOL_CIRCUIT);
            scheduleRender();
        });
        document.getElementById('tool-via').addEventListener('click', function () {
            PCB.Tools.setCurrentTool(PCB.Config.TOOL_VIA);
            scheduleRender();
        });

        // Default width/diameter inputs
        document.getElementById('default-circuit-width').addEventListener('change', function () {
            var val = parseFloat(this.value);
            if (!isNaN(val) && val > 0) {
                PCB.Tools.setDefaultCircuitWidth(val);
            }
        });
        document.getElementById('default-via-diameter').addEventListener('change', function () {
            var val = parseFloat(this.value);
            if (!isNaN(val) && val > 0) {
                PCB.Tools.setDefaultViaDiameter(val);
            }
        });

        // Delete button
        document.getElementById('btn-delete').addEventListener('click', function () {
            PCB.Tools.deleteSelected();
            scheduleRender();
        });

        // Undo/Redo buttons
        document.getElementById('btn-undo').addEventListener('click', undo);
        document.getElementById('btn-redo').addEventListener('click', redo);
    }

    function updateToolHighlight() {
        var tools = ['tool-select', 'tool-boundary', 'tool-circuit', 'tool-via'];
        var current = PCB.Tools.getCurrentTool();
        for (var i = 0; i < tools.length; i++) {
            var btn = document.getElementById(tools[i]);
            if (tools[i] === 'tool-' + current) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }

    // ---- Top Bar ----
    function getModelOpts() {
        return {
            pcbThickness: parseFloat(document.getElementById('pcb-thickness').value) || PCB.Config.DEFAULT_THICKNESS,
            traceHeight: parseFloat(document.getElementById('trace-height').value) || PCB.Config.TRACE_HEIGHT,
            enableGrooves: document.getElementById('enable-grooves').checked,
            grooveWidth: parseFloat(document.getElementById('groove-width').value) || PCB.Config.DEFAULT_GROOVE_WIDTH,
            grooveDepth: parseFloat(document.getElementById('groove-depth').value) || PCB.Config.DEFAULT_GROOVE_DEPTH,
            grooveSpacing: parseFloat(document.getElementById('groove-spacing').value) || PCB.Config.DEFAULT_GROOVE_SPACING,
            traceGap: parseFloat(document.getElementById('trace-gap').value) || PCB.Config.DEFAULT_TRACE_GAP,
            traceFence: parseFloat(document.getElementById('trace-fence').value) || PCB.Config.DEFAULT_TRACE_FENCE
        };
    }

    function bindTopBarButtons() {
        // Model Params dropdown toggle
        var paramsBtn = document.getElementById('btn-model-params');
        var paramsDropdown = document.getElementById('model-params-dropdown');
        paramsBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            paramsDropdown.classList.toggle('open');
        });
        paramsDropdown.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        document.addEventListener('click', function () {
            paramsDropdown.classList.remove('open');
        });

        // Groove checkbox toggles groove fields
        var grooveCheckbox = document.getElementById('enable-grooves');
        var grooveFields = document.getElementById('groove-fields');
        function updateGrooveFields() {
            if (grooveCheckbox.checked) {
                grooveFields.classList.remove('disabled');
            } else {
                grooveFields.classList.add('disabled');
            }
        }
        grooveCheckbox.addEventListener('change', updateGrooveFields);
        updateGrooveFields();

        // View mode
        document.getElementById('view-mode').addEventListener('change', function () {
            PCB.Renderer.setViewMode(this.value);
            scheduleRender();
        });

        // Save project
        document.getElementById('btn-save').addEventListener('click', function () {
            var opts = getModelOpts();
            PCB.Project.saveProject(elements, opts.pcbThickness, { enableGrooves: opts.enableGrooves });
        });

        // Open project from file
        document.getElementById('btn-open').addEventListener('click', function () {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', function (e) {
            if (e.target.files.length > 0) {
                PCB.Project.openProjectFromFile(e.target.files[0], function (result) {
                    if (result.error) {
                        alert(PCB.I18n.t('openError') + result.error);
                    } else {
                        loadProject(result);
                    }
                });
                e.target.value = '';
            }
        });

        // Preview STL
        var previewState = null;
        document.getElementById('btn-preview').addEventListener('click', function () {
            showToast(PCB.I18n.t('generatingPreview'));
            setTimeout(function() {
                var result = PCB.STL.exportSTL(elements, getModelOpts());
                if (result.error) {
                    alert('STL Preview Error:\n' + result.error);
                    return;
                }
                showToast(PCB.I18n.t('previewReady'));
                openPreview(result);
            }, 50);
        });

        function openPreview(result) {
            previewSTLBuffer = result.buffer;
            var overlay = document.getElementById('preview-overlay');
            var container = document.getElementById('stl-preview-cont');
            container.innerHTML = '';
            overlay.style.display = 'block';

            // Parse binary STL into geometry
            var geometry = parseBinarySTL(result.buffer);
            geometry.computeBoundingBox();
            var bbox = geometry.boundingBox;
            var cx = (bbox.min.x + bbox.max.x) / 2;
            var cy = (bbox.min.y + bbox.max.y) / 2;
            var cz = (bbox.min.z + bbox.max.z) / 2;
            geometry.translate(-cx, -cy, -cz);
            var size = bbox.getSize(new THREE.Vector3());
            var maxDim = Math.max(size.x, size.y, size.z);

            // Scene
            var scene = new THREE.Scene();
            scene.background = new THREE.Color('#1a1a2e');

            // Camera
            var w = container.clientWidth;
            var h = container.clientHeight;
            var camera = new THREE.PerspectiveCamera(45, w / h, 0.1, maxDim * 20);
            camera.position.set(0, -maxDim * 1.2, maxDim * 1.0);

            // Lighting
            scene.add(new THREE.AmbientLight(0x666666));
            var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(1, -1, 2);
            scene.add(dirLight);
            var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
            dirLight2.position.set(-1, 1, -1);
            scene.add(dirLight2);

            // Mesh
            var material = new THREE.MeshPhongMaterial({ color: 0x2980b9, specular: 0x222222, shininess: 40 });
            scene.add(new THREE.Mesh(geometry, material));

            // Renderer
            var renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(w, h);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            // Controls
            var controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.15;

            // Animate
            var animId = 0;
            function animate() {
                animId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            // Handle resize while overlay is open
            function onResize() {
                var w2 = container.clientWidth;
                var h2 = container.clientHeight;
                camera.aspect = w2 / h2;
                camera.updateProjectionMatrix();
                renderer.setSize(w2, h2);
            }
            window.addEventListener('resize', onResize);

            previewState = { animId: animId, renderer: renderer, onResize: onResize };
        }

        document.getElementById('preview-close').addEventListener('click', function () {
            document.getElementById('preview-overlay').style.display = 'none';
            if (previewState) {
                cancelAnimationFrame(previewState.animId);
                window.removeEventListener('resize', previewState.onResize);
                previewState.renderer.dispose();
                previewState = null;
            }
            document.getElementById('stl-preview-cont').innerHTML = '';
        });

        document.getElementById('preview-export').addEventListener('click', function () {
            if (previewSTLBuffer) {
                PCB.Project.downloadSTL(previewSTLBuffer);
            }
        });

        // Export STL
        document.getElementById('btn-export').addEventListener('click', function () {
            showToast(PCB.I18n.t('exportingStl'));
            setTimeout(function() {
                PCB.Project.exportSTL(elements, getModelOpts());
                showToast(PCB.I18n.t('stlExported'));
            }, 50);
        });
    }

    function loadProject(result) {
        elements.length = 0;
        for (var i = 0; i < result.elements.length; i++) {
            elements.push(result.elements[i]);
        }
        document.getElementById('pcb-thickness').value = result.pcbThickness;
        document.getElementById('enable-grooves').checked = result.enableGrooves !== false;
        PCB.Tools.setElements(elements);
        PCB.Tools.setSelectedElementId(null);
        // Reset history for loaded project
        history = [];
        historyIndex = -1;
        saveHistory();
        scheduleRender();
    }

    // ---- Canvas Events ----
    function bindCanvasEvents() {
        var canvas = PCB.Renderer.getCanvas();
        canvas.addEventListener('mousedown', PCB.Tools.onMouseDown);
        canvas.addEventListener('mousemove', PCB.Tools.onMouseMove);
        canvas.addEventListener('mouseup', PCB.Tools.onMouseUp);
        canvas.addEventListener('wheel', PCB.Tools.onWheel, { passive: false });
    }

    // ---- Keyboard ----
    function bindKeyboard() {
        document.addEventListener('keydown', function(e) {
            // Ctrl+Z: Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }
            // Ctrl+Y or Ctrl+Shift+Z: Redo
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                redo();
                return;
            }
            // Pass other keys to Tools
            PCB.Tools.onKeyDown(e);
        });
    }

    // ---- Property Panel ----
    function bindPropertyPanel() {
        document.getElementById('prop-x1').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type !== 'via') { elem.x1 = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-y1').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type !== 'via') { elem.y1 = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-x2').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type !== 'via') { elem.x2 = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-y2').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type !== 'via') { elem.y2 = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-cx').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type === 'via') { elem.cx = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-cy').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type === 'via') { elem.cy = parseInt(this.value) || 0; saveHistory(); scheduleRender(); }
        });
        document.getElementById('prop-width').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type === 'circuit') {
                var val = parseFloat(this.value);
                if (!isNaN(val) && val > 0) { elem.width = val; saveHistory(); scheduleRender(); }
            }
        });
        document.getElementById('prop-diameter').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type === 'via') {
                var val = parseFloat(this.value);
                if (!isNaN(val) && val > 0) { elem.diameter = val; saveHistory(); scheduleRender(); }
            }
        });
        document.getElementById('prop-side').addEventListener('change', function () {
            var elem = PCB.Tools.getSelectedElement();
            if (elem && elem.type === 'circuit') {
                elem.side = this.value;
                saveHistory(); scheduleRender();
            }
        });
    }

    function updatePropertyPanel() {
        var elem = PCB.Tools.getSelectedElement();
        var panel = document.getElementById('property-panel');

        if (!elem) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        document.getElementById('prop-type').textContent = elem.type.toUpperCase();

        // Show/hide fields based on type
        var lineFields = document.getElementById('prop-line-fields');
        var viaFields = document.getElementById('prop-via-fields');
        var widthField = document.getElementById('prop-width-field');
        var diameterField = document.getElementById('prop-diameter-field');
        var sideField = document.getElementById('prop-side-field');

        if (elem.type === 'via') {
            lineFields.style.display = 'none';
            viaFields.style.display = 'block';
            widthField.style.display = 'none';
            diameterField.style.display = 'block';
            sideField.style.display = 'none';
            document.getElementById('prop-cx').value = elem.cx;
            document.getElementById('prop-cy').value = elem.cy;
            document.getElementById('prop-diameter').value = elem.diameter;
        } else {
            lineFields.style.display = 'block';
            viaFields.style.display = 'none';
            document.getElementById('prop-x1').value = elem.x1;
            document.getElementById('prop-y1').value = elem.y1;
            document.getElementById('prop-x2').value = elem.x2;
            document.getElementById('prop-y2').value = elem.y2;

            // Calculate and display length in mm
            var dx = (elem.x2 - elem.x1) * PCB.Config.GRID_UNIT;
            var dy = (elem.y2 - elem.y1) * PCB.Config.GRID_UNIT;
            var length = Math.sqrt(dx * dx + dy * dy);
            document.getElementById('prop-length').value = length.toFixed(2);

            if (elem.type === 'circuit') {
                widthField.style.display = 'block';
                diameterField.style.display = 'none';
                sideField.style.display = 'block';
                document.getElementById('prop-width').value = elem.width;
                document.getElementById('prop-side').value = elem.side;
            } else {
                widthField.style.display = 'none';
                diameterField.style.display = 'none';
                sideField.style.display = 'none';
            }
        }
    }

    return {
        init: init
    };
})();

// Start app when page loads
window.addEventListener('DOMContentLoaded', function () {
    PCB.App.init();
});
