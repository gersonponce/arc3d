// Archivo JavaScript del Editor 3D

// ========================================
// EDITOR 3D - SISTEMA PRINCIPAL
// ========================================

// Variables globales del sistema
let scene, camera, renderer, orbitControls, transformControls;
let raycaster, mouse;
const selectableObjects = []; // Array para almacenar los objetos que se pueden seleccionar

// ========================================
// SISTEMA DE HISTORIAL (UNDO/REDO)
// ========================================
const undoStack = []; // Pila para almacenar el historial de acciones (deshacer)
const redoStack = []; // Pila para almacenar las acciones rehacer
let actionCounter = 0; // Contador para identificar acciones únicas
let objectIdCounter = 0; // Contador para IDs únicos de objetos

// Variables para el control de transformaciones
let isDragging = false;
let transformStartState = null;

// ========================================
// CLASES PARA EL SISTEMA DE HISTORIAL
// ========================================

/**
 * Clase base para representar una acción en el historial
 */
class Action {
    constructor(type, data) {
        this.id = ++actionCounter;
        this.type = type; // 'add', 'delete', 'transform', 'color'
        this.data = data;
        this.timestamp = Date.now();
    }
}

/**
 * Clase para acciones de añadir objetos
 */
class AddAction extends Action {
    constructor(object, position) {
        super('add', {
            objectId: object.userData.uniqueId,
            objectType: object.geometry.type,
            position: position.clone(),
            rotation: object.rotation.clone(),
            scale: object.scale.clone(),
            color: object.material.color.getHex()
        });
    }
}

/**
 * Clase para acciones de eliminar objetos
 */
class DeleteAction extends Action {
    constructor(object) {
        super('delete', {
            objectId: object.userData.uniqueId,
            objectType: object.geometry.type,
            position: object.position.clone(),
            rotation: object.rotation.clone(),
            scale: object.scale.clone(),
            color: object.material.color.getHex()
        });
    }
}

/**
 * Clase para acciones de transformación
 */
class TransformAction extends Action {
    constructor(object, oldTransform, newTransform) {
        super('transform', {
            objectId: object.userData.uniqueId,
            oldTransform: oldTransform,
            newTransform: newTransform
        });
    }
}

/**
 * Clase para acciones de cambio de color
 */
class ColorAction extends Action {
    constructor(object, oldColor, newColor) {
        super('color', {
            objectId: object.userData.uniqueId,
            oldColor: oldColor,
            newColor: newColor
        });
    }
}

// ========================================
// MÓDULO: GESTIÓN DEL HISTORIAL
// ========================================

const HistoryManager = {
    /**
     * Agrega una acción al historial
     * @param {Action} action - La acción a agregar
     */
    addToHistory(action) {
        undoStack.push(action);
        // Limpiar la pila de rehacer cuando se hace una nueva acción
        redoStack.length = 0;
        this.updateUndoRedoButtons();
    },

    /**
     * Actualiza el estado de los botones de deshacer/rehacer
     */
    updateUndoRedoButtons() {
        const undoButton = document.getElementById('btn-undo');
        const redoButton = document.getElementById('btn-redo');
        
        undoButton.disabled = undoStack.length === 0;
        redoButton.disabled = redoStack.length === 0;
    },

    /**
     * Deshace la última acción
     */
    undo() {
        if (undoStack.length === 0) return;

        const action = undoStack.pop();
        
        switch (action.type) {
            case 'add':
                this.undoAddAction(action);
                break;
            case 'delete':
                this.undoDeleteAction(action);
                break;
            case 'transform':
                this.undoTransformAction(action);
                break;
            case 'color':
                this.undoColorAction(action);
                break;
        }
        
        this.updateUndoRedoButtons();
    },

    /**
     * Rehace la última acción deshecha
     */
    redo() {
        if (redoStack.length === 0) return;

        const action = redoStack.pop();
        
        switch (action.type) {
            case 'add':
                this.redoDeleteAction(action);

                break;
            case 'delete':
                this.redoAddAction(action);
                break;
            case 'transform':
                this.redoTransformAction(action);
                break;
            case 'color':
                this.redoColorAction(action);
                break;
        }
        
        this.updateUndoRedoButtons();
    },

    // Funciones específicas para deshacer acciones
    undoAddAction(action) {
        const objectToRemove = ObjectManager.findById(action.data.objectId);
        if (objectToRemove) {
            ObjectManager.removeFromScene(objectToRemove);
            const redoAction = new Action('delete', action.data);
            redoStack.push(redoAction);
        }
    },

    undoDeleteAction(action) {
        const recreatedObject = ObjectManager.recreateObject(action.data);
        if (recreatedObject) {
            recreatedObject.userData.uniqueId = action.data.objectId;
            scene.add(recreatedObject);
            selectableObjects.push(recreatedObject);
            const redoAction = new Action('add', action.data);
            redoStack.push(redoAction);
        }
    },

    undoTransformAction(action) {
        const objectToTransform = ObjectManager.findById(action.data.objectId);
        if (objectToTransform) {
            const currentTransform = {
                position: objectToTransform.position.clone(),
                rotation: objectToTransform.rotation.clone(),
                scale: objectToTransform.scale.clone()
            };
            
            // Aplicar transformación anterior
            objectToTransform.position.copy(action.data.oldTransform.position);
            objectToTransform.rotation.copy(action.data.oldTransform.rotation);
            objectToTransform.scale.copy(action.data.oldTransform.scale);
            
            const redoAction = new Action('transform', {
                objectId: action.data.objectId,
                oldTransform: currentTransform,
                newTransform: action.data.oldTransform
            });
            redoStack.push(redoAction);
        }
    },

    undoColorAction(action) {
        const objectToRecolor = ObjectManager.findById(action.data.objectId);
        if (objectToRecolor) {
            const currentColor = objectToRecolor.material.color.getHex();
            objectToRecolor.material.color.setHex(action.data.oldColor);
            
            const redoAction = new Action('color', {
                objectId: action.data.objectId,
                oldColor: currentColor,
                newColor: action.data.oldColor
            });
            redoStack.push(redoAction);
        }
    },

    // Funciones específicas para rehacer acciones
    redoAddAction(action) {
        // Rehacer un add es volver a crear el objeto
        const recreatedObject = ObjectManager.recreateObject(action.data);
        if (recreatedObject) {
            recreatedObject.userData.uniqueId = action.data.objectId;
            scene.add(recreatedObject);
            selectableObjects.push(recreatedObject);
            // En vez de crear una nueva acción, simplemente movemos la acción original al undoStack
            undoStack.push(action);
        }
    },

    redoDeleteAction(action) {
        // Rehacer un delete es eliminar el objeto
        const objectToRemove = ObjectManager.findById(action.data.objectId);
        if (objectToRemove) {
            ObjectManager.removeFromScene(objectToRemove);
            undoStack.push(action);
        }
    },

    redoTransformAction(action) {
        // Rehacer una transformación es aplicar el newTransform
        const objectToTransform = ObjectManager.findById(action.data.objectId);
        if (objectToTransform) {
            //objectToTransform.position.copy(action.data.newTransform.position);
            //objectToTransform.rotation.copy(action.data.newTransform.rotation);
            //objectToTransform.scale.copy(action.data.newTransform.scale);

            objectToTransform.position.copy(action.data.oldTransform.position);
            objectToTransform.rotation.copy(action.data.oldTransform.rotation);
            objectToTransform.scale.copy(action.data.oldTransform.scale);
            undoStack.push(action);
        }
    },

    redoColorAction(action) {
        // Rehacer un cambio de color es aplicar el newColor
        const objectToRecolor = ObjectManager.findById(action.data.objectId);
        if (objectToRecolor) {
            objectToRecolor.material.color.setHex(action.data.newColor);
            undoStack.push(action);
        }
    }
};

// ========================================
// MÓDULO: GESTIÓN DE OBJETOS
// ========================================

const ObjectManager = {
    /**
     * Crea una geometría según el tipo especificado
     * @param {string} type - Tipo de geometría ('cube', 'sphere', 'cylinder')
     * @returns {THREE.Geometry} La geometría creada
     */
    createGeometry(type) {
        switch (type) {
            case 'cube':
                return new THREE.BoxGeometry(1, 1, 1);
            case 'sphere':
                return new THREE.SphereGeometry(0.7, 32, 16);
            case 'cylinder':
                return new THREE.CylinderGeometry(0.5, 0.5, 1.5, 32);
            default:
                return null;
        }
    },

    /**
     * Crea un material estándar
     * @param {number} color - Color del material (hex)
     * @returns {THREE.Material} El material creado
     */
    createMaterial(color = 0xffffff) {
        return new THREE.MeshStandardMaterial({ 
            color: color,
            metalness: 0.3,
            roughness: 0.6
        });
    },

    /**
     * Genera una posición aleatoria para un objeto
     * @returns {Object} Objeto con coordenadas x, y, z
     */
    generateRandomPosition() {
        return {
            x: (Math.random() - 0.5) * 5,
            y: 1,
            z: (Math.random() - 0.5) * 5
        };
    },

    /**
     * Recrea un objeto desde los datos guardados
     * @param {Object} data - Datos del objeto a recrear
     * @returns {THREE.Mesh} El objeto recreado
     */
    recreateObject(data) {
        let geometry;
        switch (data.objectType) {
            case 'BoxGeometry':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'SphereGeometry':
                geometry = new THREE.SphereGeometry(0.7, 32, 16);
                break;
            case 'CylinderGeometry':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 32);
                break;
            default:
                return null;
        }
        
        const material = this.createMaterial(data.color);
        const mesh = new THREE.Mesh(geometry, material);
        
        // Aplicar todas las transformaciones guardadas
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        
        return mesh;
    },

    /**
     * Encuentra un objeto por su ID único
     * @param {number} objectId - ID del objeto a buscar
     * @returns {THREE.Object3D} El objeto encontrado o null
     */
    findById(objectId) {
        return selectableObjects.find(obj => obj.userData.uniqueId === objectId);
    },

    /**
     * Remueve un objeto de la escena
     * @param {THREE.Object3D} object - El objeto a remover
     */
    removeFromScene(object) {
        const index = selectableObjects.indexOf(object);
        if (index > -1) {
            selectableObjects.splice(index, 1);
        }
        scene.remove(object);
        
        // Si el objeto seleccionado es el que se está eliminando, desvincular controles
        if (transformControls.object === object) {
            transformControls.detach();
        }
    },

    /**
     * Añade una nueva forma a la escena
     * @param {string} type - Tipo de forma ('cube', 'sphere', 'cylinder')
     */
    addShape(type) {
        const geometry = this.createGeometry(type);
        if (!geometry) return;

        const material = this.createMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        // Asignar un ID único al objeto
        mesh.userData.uniqueId = ++objectIdCounter;
        
        // Posicionar el objeto
        const position = this.generateRandomPosition();
        mesh.position.set(position.x, position.y, position.z);
        
        // Añadir a la escena
        scene.add(mesh);
        selectableObjects.push(mesh);

        // Seleccionar el objeto recién creado
        transformControls.attach(mesh);
        UIManager.updateColorPicker(mesh.material.color.getHexString());
        
        // Crear acción de añadir objeto
        const action = new AddAction(mesh, mesh.position);
        HistoryManager.addToHistory(action);
    },

    /**
     * Elimina el objeto seleccionado
     */
    deleteSelectedObject() {
        if (transformControls.object) {
            const objectToDelete = transformControls.object;
            
            // Crear acción de eliminar objeto antes de eliminarlo
            const action = new DeleteAction(objectToDelete);
            HistoryManager.addToHistory(action);
            
            this.removeFromScene(objectToDelete);
        }
    },

    /**
     * Cambia el color del objeto seleccionado
     * @param {string} newColor - Nuevo color en formato hex
     */
    changeObjectColor(newColor) {
        if (transformControls.object) {
            const oldColor = transformControls.object.material.color.getHex();
            transformControls.object.material.color.set(newColor);
            const newColorHex = parseInt(newColor.replace('#', ''), 16);
            
            // Crear acción de cambio de color
            const action = new ColorAction(transformControls.object, oldColor, newColorHex);
            HistoryManager.addToHistory(action);
        }
    }
};

// ========================================
// MÓDULO: GESTIÓN DE TRANSFORMACIONES
// ========================================

const TransformManager = {
    /**
     * Cambia el modo de transformación
     * @param {string} mode - Modo de transformación ('translate', 'rotate', 'scale')
     */
    setMode(mode) {
        transformControls.setMode(mode);
        // Actualizar la clase 'active' en los botones de la UI
        ['translate', 'rotate', 'scale'].forEach(m => {
            document.getElementById(`btn-${m}`).classList.toggle('active', m === mode);
        });
    },

    /**
     * Maneja el inicio de una transformación
     */
    onTransformStart() {
        if (transformControls.object) {
            isDragging = true;
            // Guardar el estado inicial del objeto antes de la transformación
            transformStartState = {
                position: transformControls.object.position.clone(),
                rotation: transformControls.object.rotation.clone(),
                scale: transformControls.object.scale.clone()
            };
        }
    },

    /**
     * Maneja el fin de una transformación
     */
    onTransformEnd() {
        if (isDragging && transformControls.object && transformStartState) {
            isDragging = false;
            
            // Verificar si realmente hubo un cambio
            const currentPosition = transformControls.object.position.clone();
            const currentRotation = transformControls.object.rotation.clone();
            const currentScale = transformControls.object.scale.clone();
            
            const hasChanged = !currentPosition.equals(transformStartState.position) ||
                             !currentRotation.equals(transformStartState.rotation) ||
                             !currentScale.equals(transformStartState.scale);
            
            if (hasChanged) {
                // Crear la acción de transformación solo si hubo cambios
                const action = new TransformAction(
                    transformControls.object, 
                    transformStartState, 
                    {
                        position: currentPosition,
                        rotation: currentRotation,
                        scale: currentScale
                    }
                );
                HistoryManager.addToHistory(action);
            }
            
            // Limpiar el estado inicial
            transformStartState = null;
        }
    }
};

// ========================================
// MÓDULO: GESTIÓN DE LA INTERFAZ DE USUARIO
// ========================================

const UIManager = {
    /**
     * Actualiza el selector de color
     * @param {string} hexColor - Color en formato hex
     */
    updateColorPicker(hexColor) {
        document.getElementById('color-picker').value = `#${hexColor}`;
    },

    /**
     * Configura todos los event listeners de la UI
     */
    setupEventListeners() {
        // Botones de historial
        document.getElementById('btn-undo').addEventListener('click', () => HistoryManager.undo());
        document.getElementById('btn-redo').addEventListener('click', () => HistoryManager.redo());
        
        // Botones para añadir formas
        document.getElementById('add-cube').addEventListener('click', () => ObjectManager.addShape('cube'));
        document.getElementById('add-sphere').addEventListener('click', () => ObjectManager.addShape('sphere'));
        document.getElementById('add-cylinder').addEventListener('click', () => ObjectManager.addShape('cylinder'));
        
        // Botones de herramientas de transformación
        document.getElementById('btn-translate').addEventListener('click', () => TransformManager.setMode('translate'));
        document.getElementById('btn-rotate').addEventListener('click', () => TransformManager.setMode('rotate'));
        document.getElementById('btn-scale').addEventListener('click', () => TransformManager.setMode('scale'));
        
        // Selector de color
        document.getElementById('color-picker').addEventListener('input', (event) => {
            ObjectManager.changeObjectColor(event.target.value);
        });

        // Botón de eliminar
        document.getElementById('delete-object').addEventListener('click', () => ObjectManager.deleteSelectedObject());
    }
};

// ========================================
// MÓDULO: GESTIÓN DE EVENTOS DEL CANVAS
// ========================================

const EventManager = {
    /**
     * Maneja clics en el canvas
     * @param {MouseEvent} event - Evento del mouse
     */
    onCanvasClick(event) {
        // Ignora los clics si se está usando el control de transformación
        if (transformControls.dragging) return;
        
        // Calcula la posición del ratón en coordenadas normalizadas (-1 a +1)
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        // Lanza un rayo desde la cámara a través del punto del ratón
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(selectableObjects, false);

        if (intersects.length > 0) {
            // Si se intersecta un objeto, se adjuntan los controles
            const selectedObject = intersects[0].object;
            transformControls.attach(selectedObject);
            UIManager.updateColorPicker(selectedObject.material.color.getHexString());
        } else {
            // Si no se intersecta nada, se desvinculan los controles
            transformControls.detach();
            UIManager.updateColorPicker('ffffff');
        }
    },

    /**
     * Maneja el redimensionamiento de la ventana
     */
    onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    },

    /**
     * Configura todos los event listeners
     */
    setupEventListeners() {
        window.addEventListener('resize', this.onWindowResize);
        renderer.domElement.addEventListener('click', this.onCanvasClick);
    }
};

// ========================================
// MÓDULO: CONFIGURACIÓN DE LA ESCENA
// ========================================

const SceneManager = {
    /**
     * Configura la iluminación de la escena
     */
    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 5);
        scene.add(directionalLight);
    },

    /**
     * Configura ayudantes visuales (grid y ejes)
     */
    setupHelpers() {
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x888888);
        scene.add(gridHelper);
        
        const axesHelper = new THREE.AxesHelper(3);
        scene.add(axesHelper);
    },

    /**
     * Configura los controles de la cámara y transformación
     */
    setupControls() {
        // Controles de órbita (para la cámara)
        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;

        // Controles de transformación (para los objetos)
        transformControls = new THREE.TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('dragging-changed', (event) => {
            // Deshabilita los controles de la cámara mientras se arrastra un objeto
            orbitControls.enabled = !event.value;
            
            // Manejar el inicio y fin del arrastre para el historial
            if (event.value) {
                TransformManager.onTransformStart();
            } else {
                TransformManager.onTransformEnd();
            }
        });
        
        scene.add(transformControls);
    }
};

// ========================================
// FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// ========================================

function init() {
    // 1. ESCENA
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x334155); // Un fondo gris azulado oscuro

    // 2. CÁMARA
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    // 3. RENDERER
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. CONFIGURACIÓN DE LA ESCENA
    SceneManager.setupLighting();
    SceneManager.setupHelpers();
    SceneManager.setupControls();

    // 5. RAYCASTER (para detectar clics en objetos)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 6. CONFIGURACIÓN DE EVENTOS
    EventManager.setupEventListeners();
    UIManager.setupEventListeners();
    
    // 7. Iniciar el bucle de animación
    animate();
}

// ========================================
// BUCLE DE ANIMACIÓN
// ========================================

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    renderer.render(scene, camera);
}

// ========================================
// EXPORTACIÓN PARA USO GLOBAL
// ========================================

// Hacer las funciones disponibles globalmente
window.HistoryManager = HistoryManager;
window.ObjectManager = ObjectManager;
window.TransformManager = TransformManager;
window.UIManager = UIManager;
window.EventManager = EventManager;
window.SceneManager = SceneManager;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
