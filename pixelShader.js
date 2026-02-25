/*
To do:
Add more palettes
Add function / hotkey to randomize inputs
Simplify color palette input / closest color distance functions
*/

// DOM Elements
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl', {preserveDrawingBuffer: false}) || canvas.getContext('experimental-webgl');
const fileInput = document.getElementById('fileInput');
const inputToggle = document.getElementById('inputToggle');
let currentVideo = null;
let isWebcam = true;
let animationPlayToggle = false;
let animationRequest;
let isMobileFlag = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
console.log("Mobile?: "+isMobileFlag);

let userVideo = document.getElementById('userVideo');
let defaultVideo = document.getElementById('defaultVideo');
let defaultVideoWidth = 900;
let defaultVideoHeight = 504;
let maxCanvasWidth = 1200;

if (!gl) {
  alert('WebGL not supported');
  throw new Error('WebGL not supported');
}

//add gui
let paletteNames = ["field","underwater","forest","flame","dusk","grayscale",
  "vampire","ink","galaxy","acid","sand","morning","twilight","lofi","moonlight","pastel","original"];

let obj = {
  pixelSize: 8,
  ditherFactor: 0.15,
  colorPalette: "morning",
  edgeThreshold: 0.15,
  edgeIntensity: 0.2,
  edgeColor: [200, 200, 210],
  temporalBlend: 0.75,
  temporalThreshold: 0.08,
  preset: "Dreamy Bedroom",
};

const presets = {
  "Dreamy Bedroom": {
    pixelSize: 8,
    ditherFactor: 0.15,
    colorPalette: "morning",
    edgeThreshold: 0.15,
    edgeIntensity: 0.2,
    edgeColor: [200, 200, 210],
    temporalBlend: 0.75,
    temporalThreshold: 0.08,
  },
  "Lo-fi Night": {
    pixelSize: 6,
    ditherFactor: 0.25,
    colorPalette: "twilight",
    edgeThreshold: 0.2,
    edgeIntensity: 0.3,
    edgeColor: [100, 100, 140],
    temporalBlend: 0.7,
    temporalThreshold: 0.1,
  },
  "Retro Game": {
    pixelSize: 12,
    ditherFactor: 0.3,
    colorPalette: "field",
    edgeThreshold: 0.25,
    edgeIntensity: 0.6,
    edgeColor: [0, 0, 0],
    temporalBlend: 0.5,
    temporalThreshold: 0.15,
  },
  "Watercolor": {
    pixelSize: 4,
    ditherFactor: 0.1,
    colorPalette: "pastel",
    edgeThreshold: 0.1,
    edgeIntensity: 0.15,
    edgeColor: [180, 160, 170],
    temporalBlend: 0.8,
    temporalThreshold: 0.06,
  },
  "Original Colors": {
    pixelSize: 6,
    ditherFactor: 0.08,
    colorPalette: "original",
    edgeThreshold: 0.12,
    edgeIntensity: 0.15,
    edgeColor: [40, 40, 50],
    temporalBlend: 0.75,
    temporalThreshold: 0.08,
  },
};

const presetNames = [...Object.keys(presets), "Custom"];
const presetButtons = Array.from(document.querySelectorAll('.preset-chip'));

function updatePresetChips(activePreset) {
  presetButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.preset === activePreset);
  });
}

function applyPreset(presetName) {
  const preset = presets[presetName];
  if (!preset) {
    return;
  }
  obj.pixelSize = preset.pixelSize;
  obj.ditherFactor = preset.ditherFactor;
  obj.colorPalette = preset.colorPalette;
  obj.edgeThreshold = preset.edgeThreshold;
  obj.edgeIntensity = preset.edgeIntensity;
  obj.edgeColor = [...preset.edgeColor];
  obj.temporalBlend = preset.temporalBlend;
  obj.temporalThreshold = preset.temporalThreshold;
  obj.preset = presetName;
  invalidateTemporalHistory();
  updatePresetChips(presetName);
}

let gui = new dat.gui.GUI( { autoPlace: false } );
// gui.close();
let guiOpenToggle = true;

obj['useWebcam'] = function () {
  useWebcam();
};
gui.add(obj, 'useWebcam').name('Use Webcam');

obj['uploadVideo'] = function () {
  fileInput.click();
};
gui.add(obj, 'uploadVideo').name('Upload Video');

const presetController = gui.add(obj, 'preset', presetNames).name('Preset').listen();
const pixelSizeController = gui.add(obj, "pixelSize").min(1).max(32).step(1).name('Pixel Size').listen();
const ditherController = gui.add(obj, "ditherFactor").min(0).max(1).step(0.01).name('Dither Strength').listen();
const paletteController = gui.add(obj, "colorPalette", paletteNames).name('Color Palette').listen();
const edgeThresholdController = gui.add(obj, "edgeThreshold").min(0.01).max(0.5).step(0.01).name('Edge Threshold').listen();
const edgeIntensityController = gui.add(obj, "edgeIntensity").min(0).max(1).step(0.01).name('Edge Intensity').listen();
const edgeColorController = gui.addColor(obj, "edgeColor").name('Edge Color').listen();
const temporalBlendController = gui.add(obj, "temporalBlend").min(0).max(1).step(0.01).name('Temporal Blend').listen();
const temporalThresholdController = gui.add(obj, "temporalThreshold").min(0.01).max(0.4).step(0.01).name('Temporal Threshold').listen();

function refreshGuiControllers() {
  presetController.updateDisplay();
  pixelSizeController.updateDisplay();
  ditherController.updateDisplay();
  paletteController.updateDisplay();
  edgeThresholdController.updateDisplay();
  edgeIntensityController.updateDisplay();
  edgeColorController.updateDisplay();
  temporalBlendController.updateDisplay();
  temporalThresholdController.updateDisplay();
}

function markPresetAsCustom() {
  if (obj.preset !== "Custom") {
    obj.preset = "Custom";
    presetController.updateDisplay();
    updatePresetChips(null);
  }
}

presetController.onChange((value) => {
  applyPreset(value);
  refreshGuiControllers();
});

[pixelSizeController, ditherController, paletteController, edgeThresholdController, edgeIntensityController, edgeColorController, temporalBlendController, temporalThresholdController].forEach((controller) => {
  controller.onChange(() => {
    markPresetAsCustom();
    invalidateTemporalHistory();
  });
});

presetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    applyPreset(button.dataset.preset);
    refreshGuiControllers();
  });
});

updatePresetChips(obj.preset);

obj['randomizeInputs'] = function () {
  randomizeInputs();
};
gui.add(obj, 'randomizeInputs').name("Randomize Inputs (r)");

obj['pausePlay'] = function () {
  toggleAnimationPlay();
};
gui.add(obj, 'pausePlay').name("Pause/Play (p)");

obj['saveImage'] = function () {
  saveImage();
};
gui.add(obj, 'saveImage').name("Save Image (s)");

obj['saveVideo'] = function () {
  toggleVideoRecord();
};
gui.add(obj, 'saveVideo').name("Video Export (v)");

customContainer = document.getElementById( 'gui' );
customContainer.appendChild(gui.domElement);

// Define color palettes
const palettes = {
    0: [
        [0.950, 0.950, 0.950], // White clouds
        [0.529, 0.808, 0.922], // Sky blue
        [0.275, 0.510, 0.706], // Dark blue
        [0.463, 0.635, 0.439], // Forest green
        [0.322, 0.424, 0.314], // Dark green
        [0.957, 0.843, 0.647], // Wheat yellow
        [0.839, 0.678, 0.427], // Dark wheat
        [0.682, 0.506, 0.427], // Brown
        [0.408, 0.302, 0.294], // Dark brown
        [0.216, 0.216, 0.216]  // Shadow
    ],
    1: [
        [0.118, 0.471, 0.706], // Deep blue
        [0.173, 0.612, 0.620], // Teal
        [0.255, 0.757, 0.678], // Light teal
        [1.000, 0.412, 0.380], // Coral red
        [0.957, 0.643, 0.376], // Coral orange
        [0.824, 0.369, 0.584], // Purple coral
        [0.467, 0.745, 0.851], // Light blue
        [0.298, 0.180, 0.247], // Deep purple
        [0.925, 0.941, 0.945], // White
        [0.078, 0.110, 0.141]  // Dark blue
    ],
    2: [
        [0.133, 0.184, 0.133], // Dark green
        [0.255, 0.369, 0.196], // Mid green
        [0.475, 0.557, 0.286], // Light green
        [0.702, 0.639, 0.298], // Yellow-green
        [0.408, 0.314, 0.235], // Brown
        [0.573, 0.439, 0.322], // Light brown
        [0.765, 0.765, 0.847], // Light blue
        [0.631, 0.631, 0.737], // Misty blue
        [0.871, 0.886, 0.894], // White
        [0.424, 0.459, 0.404]  // Gray green
    ],
    3: [
        [1.000, 0.439, 0.122], // Bright orange
        [0.961, 0.647, 0.263], // Light orange
        [1.000, 0.843, 0.000], // Sun yellow
        [0.702, 0.341, 0.165], // Dark orange
        [0.529, 0.220, 0.196], // Dark red
        [0.231, 0.184, 0.235], // Dark purple
        [0.333, 0.278, 0.365], // Mountain purple
        [0.455, 0.376, 0.490], // Light purple
        [0.098, 0.098, 0.137], // Near black
        [0.835, 0.584, 0.310]  // Gold
    ],
    4: [
        [0.039, 0.039, 0.078], // Night blue
        [0.118, 0.157, 0.275], // Deep blue
        [0.275, 0.196, 0.408], // Purple blue
        [0.839, 0.424, 0.400], // Coral
        [0.957, 0.576, 0.447], // Light coral
        [1.000, 0.871, 0.678], // Light yellow
        [0.173, 0.220, 0.369], // City blue
        [0.471, 0.349, 0.557], // Mid purple
        [1.000, 1.000, 1.000], // White
        [0.557, 0.612, 0.722]  // Light blue
    ],
    5: [
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [0.000, 0.000, 0.000], // Black
        [1.000, 1.000, 1.000]  // White
    ],
    6: [
      [0.059, 0.063, 0.082],  // Deep dark background
      [0.118, 0.125, 0.157],  // Dark blue-gray
      [0.196, 0.208, 0.255],  // Light blue highlights
      [0.157, 0.165, 0.196],  // Medium blue-gray
      [0.392, 0.059, 0.078],  // Dark red
      [0.784, 0.118, 0.157],  // Medium red
      [0.902, 0.235, 0.196],  // Bright red
      [1.000, 0.392, 0.275],  // Orange-red glow
      [1.000, 0.627, 0.431],  // Light orange highlight
      [1.000, 0.824, 0.667]   // Pale orange glow
    ],
    7: [
      [0.031, 0.031, 0.031],  // Deep black background
      [0.118, 0.098, 0.118],  // Dark purple-gray (shadows)
      [0.275, 0.157, 0.196],  // Dark burgundy (clothing)
      [0.431, 0.196, 0.235],  // Medium red (mushroom cap)
      [0.784, 0.275, 0.314],  // Bright red (mushroom highlights)
      [0.392, 0.275, 0.196],  // Brown (staff/leather)
      [0.549, 0.510, 0.431],  // Light gray (mushroom underside)
      [0.627, 0.706, 0.235],  // Bright green (leaves/moss)
      [0.824, 0.824, 0.824],  // White (highlights)
      [1.000, 1.000, 1.000]   // Pure white (spots/outline)
    ],
    8: [
      [0.020, 0.024, 0.078],  // Deep navy background
      [0.039, 0.047, 0.157],  // Dark blue (outer edge)
      [0.078, 0.118, 0.314],  // Medium blue
      [0.157, 0.235, 0.627],  // Bright blue
      [0.314, 0.431, 0.902],  // Light blue glow
      [0.784, 0.275, 0.431],  // Dark pink
      [0.980, 0.392, 0.549],  // Bright pink
      [0.980, 0.706, 0.431],  // Orange/yellow
      [1.000, 0.863, 0.627],  // Light yellow
      [1.000, 1.000, 1.000]   // Pure white highlights
    ],
    9: [
      [0.031, 0.027, 0.035],  // Deep black
      [0.157, 0.118, 0.196],  // Dark purple
      [0.235, 0.392, 0.902],  // Bright blue
      [0.431, 0.314, 0.784],  // Medium purple
      [0.902, 0.431, 0.784],  // Bright pink
      [0.980, 0.549, 0.902],  // Light pink
      [0.196, 0.784, 0.314],  // Bright green
      [0.980, 0.784, 0.196],  // Yellow/orange
      [0.902, 0.902, 0.980],  // Light blue/white
      [1.000, 1.000, 1.000]   // Pure white highlights
    ],
    10: [
      [0.231, 0.141, 0.090],  // Deep Walnut
      [0.361, 0.227, 0.129],  // Dark Oak
      [0.545, 0.271, 0.075],  // Rustic Brown
      [0.627, 0.322, 0.176],  // Warm Umber
      [0.737, 0.561, 0.561],  // Cedar
      [0.824, 0.706, 0.549],  // Desert Sand
      [0.871, 0.722, 0.529],  // Wheat
      [0.933, 0.796, 0.678],  // Pale Almond
      [0.980, 0.922, 0.843],  // Antique White
      [1.000, 1.000, 0.941]   // Ivory
    ],
    11: [
      [0.247, 0.267, 0.337],
      [0.322, 0.357, 0.427],
      [0.404, 0.443, 0.486],
      [0.486, 0.451, 0.471],
      [0.553, 0.533, 0.506],
      [0.639, 0.624, 0.561],
      [0.737, 0.698, 0.635],
      [0.812, 0.753, 0.702],
      [0.886, 0.851, 0.784],
      [0.949, 0.925, 0.867]
    ],
    12: [
      [0.102, 0.114, 0.188],
      [0.165, 0.176, 0.290],
      [0.251, 0.224, 0.384],
      [0.337, 0.282, 0.451],
      [0.447, 0.357, 0.486],
      [0.561, 0.420, 0.455],
      [0.663, 0.506, 0.514],
      [0.753, 0.631, 0.675],
      [0.839, 0.800, 0.827],
      [0.910, 0.886, 0.871]
    ],
    13: [
      [0.153, 0.149, 0.157],
      [0.251, 0.251, 0.267],
      [0.333, 0.349, 0.357],
      [0.420, 0.447, 0.431],
      [0.510, 0.549, 0.486],
      [0.529, 0.580, 0.631],
      [0.635, 0.651, 0.608],
      [0.737, 0.710, 0.639],
      [0.824, 0.792, 0.745],
      [0.902, 0.875, 0.824]
    ],
    14: [
      [0.071, 0.098, 0.157],
      [0.129, 0.169, 0.259],
      [0.200, 0.251, 0.357],
      [0.282, 0.341, 0.451],
      [0.388, 0.447, 0.565],
      [0.545, 0.596, 0.671],
      [0.690, 0.725, 0.773],
      [0.804, 0.820, 0.843],
      [0.741, 0.620, 0.490],
      [0.914, 0.882, 0.827]
    ],
    15: [
      [0.404, 0.420, 0.565],
      [0.514, 0.600, 0.776],
      [0.620, 0.753, 0.816],
      [0.651, 0.816, 0.737],
      [0.824, 0.890, 0.773],
      [0.976, 0.945, 0.843],
      [0.941, 0.820, 0.824],
      [0.910, 0.749, 0.863],
      [0.824, 0.753, 0.902],
      [0.961, 0.922, 0.980]
    ],
};

// Helper function to generate shader color definitions
function createPaletteDefinitions() {
    let defs = '';
    Object.entries(palettes).forEach(([name, colors], index) => {
        colors.forEach((color, i) => {
            defs += `const vec3 c${index}_${i} = vec3(${color[0].toFixed(3)}, ${color[1].toFixed(3)}, ${color[2].toFixed(3)});\n`;
        });
        defs += '\n';
    });
    return defs;
}

const vertexShaderSource = `
    attribute vec2 position;
    attribute vec2 texCoord;
    varying vec2 vTexCoord;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        vTexCoord = texCoord;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    uniform vec2 resolution;
    uniform float pixelSize;
    uniform float ditherFactor;
    uniform int paletteChoice;
    uniform float edgeThreshold;
    uniform float edgeIntensity;
    uniform vec3 edgeColor;

    ${createPaletteDefinitions()}

    // Sobel operator kernels
    mat3 sobelX = mat3(
        -1.0, 0.0, 1.0,
        -2.0, 0.0, 2.0,
        -1.0, 0.0, 1.0
    );

    mat3 sobelY = mat3(
        -1.0, -2.0, -1.0,
         0.0,  0.0,  0.0,
         1.0,  2.0,  1.0
    );

    // Helper function to get grayscale value
    float getLuminance(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    // Edge detection function
    float detectEdge(vec2 coord) {
        float pixelWidth = 1.0 / resolution.x;
        float pixelHeight = 1.0 / resolution.y;
        
        float gx = 0.0;
        float gy = 0.0;
        
        // Apply Sobel operator
        for(int i = -1; i <= 1; i++) {
            for(int j = -1; j <= 1; j++) {
                vec2 offset = vec2(float(i) * pixelWidth, float(j) * pixelHeight);
                vec3 color = texture2D(uTexture, coord + offset).rgb;
                float luminance = getLuminance(color);
                
                gx += luminance * sobelX[i+1][j+1];
                gy += luminance * sobelY[i+1][j+1];
            }
        }
        
        return sqrt(gx * gx + gy * gy);
    }

    vec3 findClosestColor(vec3 color) {
        float minDist = 1000.0;
        vec3 closestColor;
        float dist;

        if (paletteChoice == 0) {
            // field
            dist = distance(color, c0_0); if(dist < minDist) { minDist = dist; closestColor = c0_0; }
            dist = distance(color, c0_1); if(dist < minDist) { minDist = dist; closestColor = c0_1; }
            dist = distance(color, c0_2); if(dist < minDist) { minDist = dist; closestColor = c0_2; }
            dist = distance(color, c0_3); if(dist < minDist) { minDist = dist; closestColor = c0_3; }
            dist = distance(color, c0_4); if(dist < minDist) { minDist = dist; closestColor = c0_4; }
            dist = distance(color, c0_5); if(dist < minDist) { minDist = dist; closestColor = c0_5; }
            dist = distance(color, c0_6); if(dist < minDist) { minDist = dist; closestColor = c0_6; }
            dist = distance(color, c0_7); if(dist < minDist) { minDist = dist; closestColor = c0_7; }
            dist = distance(color, c0_8); if(dist < minDist) { minDist = dist; closestColor = c0_8; }
            dist = distance(color, c0_9); if(dist < minDist) { minDist = dist; closestColor = c0_9; }
        } else if (paletteChoice == 1) {
            // Underwater
            dist = distance(color, c1_0); if(dist < minDist) { minDist = dist; closestColor = c1_0; }
            dist = distance(color, c1_1); if(dist < minDist) { minDist = dist; closestColor = c1_1; }
            dist = distance(color, c1_2); if(dist < minDist) { minDist = dist; closestColor = c1_2; }
            dist = distance(color, c1_3); if(dist < minDist) { minDist = dist; closestColor = c1_3; }
            dist = distance(color, c1_4); if(dist < minDist) { minDist = dist; closestColor = c1_4; }
            dist = distance(color, c1_5); if(dist < minDist) { minDist = dist; closestColor = c1_5; }
            dist = distance(color, c1_6); if(dist < minDist) { minDist = dist; closestColor = c1_6; }
            dist = distance(color, c1_7); if(dist < minDist) { minDist = dist; closestColor = c1_7; }
            dist = distance(color, c1_8); if(dist < minDist) { minDist = dist; closestColor = c1_8; }
            dist = distance(color, c1_9); if(dist < minDist) { minDist = dist; closestColor = c1_9; }
        } else if (paletteChoice == 2) {
            // Forest
            dist = distance(color, c2_0); if(dist < minDist) { minDist = dist; closestColor = c2_0; }
            dist = distance(color, c2_1); if(dist < minDist) { minDist = dist; closestColor = c2_1; }
            dist = distance(color, c2_2); if(dist < minDist) { minDist = dist; closestColor = c2_2; }
            dist = distance(color, c2_3); if(dist < minDist) { minDist = dist; closestColor = c2_3; }
            dist = distance(color, c2_4); if(dist < minDist) { minDist = dist; closestColor = c2_4; }
            dist = distance(color, c2_5); if(dist < minDist) { minDist = dist; closestColor = c2_5; }
            dist = distance(color, c2_6); if(dist < minDist) { minDist = dist; closestColor = c2_6; }
            dist = distance(color, c2_7); if(dist < minDist) { minDist = dist; closestColor = c2_7; }
            dist = distance(color, c2_8); if(dist < minDist) { minDist = dist; closestColor = c2_8; }
            dist = distance(color, c2_9); if(dist < minDist) { minDist = dist; closestColor = c2_9; }
        } else if (paletteChoice == 3) {
            // Flame
            dist = distance(color, c3_0); if(dist < minDist) { minDist = dist; closestColor = c3_0; }
            dist = distance(color, c3_1); if(dist < minDist) { minDist = dist; closestColor = c3_1; }
            dist = distance(color, c3_2); if(dist < minDist) { minDist = dist; closestColor = c3_2; }
            dist = distance(color, c3_3); if(dist < minDist) { minDist = dist; closestColor = c3_3; }
            dist = distance(color, c3_4); if(dist < minDist) { minDist = dist; closestColor = c3_4; }
            dist = distance(color, c3_5); if(dist < minDist) { minDist = dist; closestColor = c3_5; }
            dist = distance(color, c3_6); if(dist < minDist) { minDist = dist; closestColor = c3_6; }
            dist = distance(color, c3_7); if(dist < minDist) { minDist = dist; closestColor = c3_7; }
            dist = distance(color, c3_8); if(dist < minDist) { minDist = dist; closestColor = c3_8; }
            dist = distance(color, c3_9); if(dist < minDist) { minDist = dist; closestColor = c3_9; }
        } else if (paletteChoice == 4) {
            // Dusk
            dist = distance(color, c4_0); if(dist < minDist) { minDist = dist; closestColor = c4_0; }
            dist = distance(color, c4_1); if(dist < minDist) { minDist = dist; closestColor = c4_1; }
            dist = distance(color, c4_2); if(dist < minDist) { minDist = dist; closestColor = c4_2; }
            dist = distance(color, c4_3); if(dist < minDist) { minDist = dist; closestColor = c4_3; }
            dist = distance(color, c4_4); if(dist < minDist) { minDist = dist; closestColor = c4_4; }
            dist = distance(color, c4_5); if(dist < minDist) { minDist = dist; closestColor = c4_5; }
            dist = distance(color, c4_6); if(dist < minDist) { minDist = dist; closestColor = c4_6; }
            dist = distance(color, c4_7); if(dist < minDist) { minDist = dist; closestColor = c4_7; }
            dist = distance(color, c4_8); if(dist < minDist) { minDist = dist; closestColor = c4_8; }
            dist = distance(color, c4_9); if(dist < minDist) { minDist = dist; closestColor = c4_9; }
        } else if (paletteChoice == 5) {
            // Grayscale
            dist = distance(color, c5_0); if(dist < minDist) { minDist = dist; closestColor = c5_0; }
            dist = distance(color, c5_1); if(dist < minDist) { minDist = dist; closestColor = c5_1; }
            dist = distance(color, c5_2); if(dist < minDist) { minDist = dist; closestColor = c5_2; }
            dist = distance(color, c5_3); if(dist < minDist) { minDist = dist; closestColor = c5_3; }
            dist = distance(color, c5_4); if(dist < minDist) { minDist = dist; closestColor = c5_4; }
            dist = distance(color, c5_5); if(dist < minDist) { minDist = dist; closestColor = c5_5; }
            dist = distance(color, c5_6); if(dist < minDist) { minDist = dist; closestColor = c5_6; }
            dist = distance(color, c5_7); if(dist < minDist) { minDist = dist; closestColor = c5_7; }
            dist = distance(color, c5_8); if(dist < minDist) { minDist = dist; closestColor = c5_8; }
            dist = distance(color, c5_9); if(dist < minDist) { minDist = dist; closestColor = c5_9; }
        } else if (paletteChoice == 6) {
            // Vampire
            dist = distance(color, c6_0); if(dist < minDist) { minDist = dist; closestColor = c6_0; }
            dist = distance(color, c6_1); if(dist < minDist) { minDist = dist; closestColor = c6_1; }
            dist = distance(color, c6_2); if(dist < minDist) { minDist = dist; closestColor = c6_2; }
            dist = distance(color, c6_3); if(dist < minDist) { minDist = dist; closestColor = c6_3; }
            dist = distance(color, c6_4); if(dist < minDist) { minDist = dist; closestColor = c6_4; }
            dist = distance(color, c6_5); if(dist < minDist) { minDist = dist; closestColor = c6_5; }
            dist = distance(color, c6_6); if(dist < minDist) { minDist = dist; closestColor = c6_6; }
            dist = distance(color, c6_7); if(dist < minDist) { minDist = dist; closestColor = c6_7; }
            dist = distance(color, c6_8); if(dist < minDist) { minDist = dist; closestColor = c6_8; }
            dist = distance(color, c6_9); if(dist < minDist) { minDist = dist; closestColor = c6_9; }
        } else if (paletteChoice == 7){
            // Ink
            dist = distance(color, c7_0); if(dist < minDist) { minDist = dist; closestColor = c7_0; }
            dist = distance(color, c7_1); if(dist < minDist) { minDist = dist; closestColor = c7_1; }
            dist = distance(color, c7_2); if(dist < minDist) { minDist = dist; closestColor = c7_2; }
            dist = distance(color, c7_3); if(dist < minDist) { minDist = dist; closestColor = c7_3; }
            dist = distance(color, c7_4); if(dist < minDist) { minDist = dist; closestColor = c7_4; }
            dist = distance(color, c7_5); if(dist < minDist) { minDist = dist; closestColor = c7_5; }
            dist = distance(color, c7_6); if(dist < minDist) { minDist = dist; closestColor = c7_6; }
            dist = distance(color, c7_7); if(dist < minDist) { minDist = dist; closestColor = c7_7; }
            dist = distance(color, c7_8); if(dist < minDist) { minDist = dist; closestColor = c7_8; }
            dist = distance(color, c7_9); if(dist < minDist) { minDist = dist; closestColor = c7_9; }
        } else if (paletteChoice == 8){
            // Galaxy
            dist = distance(color, c8_0); if(dist < minDist) { minDist = dist; closestColor = c8_0; }
            dist = distance(color, c8_1); if(dist < minDist) { minDist = dist; closestColor = c8_1; }
            dist = distance(color, c8_2); if(dist < minDist) { minDist = dist; closestColor = c8_2; }
            dist = distance(color, c8_3); if(dist < minDist) { minDist = dist; closestColor = c8_3; }
            dist = distance(color, c8_4); if(dist < minDist) { minDist = dist; closestColor = c8_4; }
            dist = distance(color, c8_5); if(dist < minDist) { minDist = dist; closestColor = c8_5; }
            dist = distance(color, c8_6); if(dist < minDist) { minDist = dist; closestColor = c8_6; }
            dist = distance(color, c8_7); if(dist < minDist) { minDist = dist; closestColor = c8_7; }
            dist = distance(color, c8_8); if(dist < minDist) { minDist = dist; closestColor = c8_8; }
            dist = distance(color, c8_9); if(dist < minDist) { minDist = dist; closestColor = c8_9; }
        } else if (paletteChoice == 9){
            // acid
            dist = distance(color, c9_0); if(dist < minDist) { minDist = dist; closestColor = c9_0; }
            dist = distance(color, c9_1); if(dist < minDist) { minDist = dist; closestColor = c9_1; }
            dist = distance(color, c9_2); if(dist < minDist) { minDist = dist; closestColor = c9_2; }
            dist = distance(color, c9_3); if(dist < minDist) { minDist = dist; closestColor = c9_3; }
            dist = distance(color, c9_4); if(dist < minDist) { minDist = dist; closestColor = c9_4; }
            dist = distance(color, c9_5); if(dist < minDist) { minDist = dist; closestColor = c9_5; }
            dist = distance(color, c9_6); if(dist < minDist) { minDist = dist; closestColor = c9_6; }
            dist = distance(color, c9_7); if(dist < minDist) { minDist = dist; closestColor = c9_7; }
            dist = distance(color, c9_8); if(dist < minDist) { minDist = dist; closestColor = c9_8; }
            dist = distance(color, c9_9); if(dist < minDist) { minDist = dist; closestColor = c9_9; }
        } else if (paletteChoice == 10){
            // sand
            dist = distance(color, c10_0); if(dist < minDist) { minDist = dist; closestColor = c10_0; }
            dist = distance(color, c10_1); if(dist < minDist) { minDist = dist; closestColor = c10_1; }
            dist = distance(color, c10_2); if(dist < minDist) { minDist = dist; closestColor = c10_2; }
            dist = distance(color, c10_3); if(dist < minDist) { minDist = dist; closestColor = c10_3; }
            dist = distance(color, c10_4); if(dist < minDist) { minDist = dist; closestColor = c10_4; }
            dist = distance(color, c10_5); if(dist < minDist) { minDist = dist; closestColor = c10_5; }
            dist = distance(color, c10_6); if(dist < minDist) { minDist = dist; closestColor = c10_6; }
            dist = distance(color, c10_7); if(dist < minDist) { minDist = dist; closestColor = c10_7; }
            dist = distance(color, c10_8); if(dist < minDist) { minDist = dist; closestColor = c10_8; }
            dist = distance(color, c10_9); if(dist < minDist) { minDist = dist; closestColor = c10_9; }
        } else if (paletteChoice == 11){
            dist = distance(color, c11_0); if(dist < minDist) { minDist = dist; closestColor = c11_0; }
            dist = distance(color, c11_1); if(dist < minDist) { minDist = dist; closestColor = c11_1; }
            dist = distance(color, c11_2); if(dist < minDist) { minDist = dist; closestColor = c11_2; }
            dist = distance(color, c11_3); if(dist < minDist) { minDist = dist; closestColor = c11_3; }
            dist = distance(color, c11_4); if(dist < minDist) { minDist = dist; closestColor = c11_4; }
            dist = distance(color, c11_5); if(dist < minDist) { minDist = dist; closestColor = c11_5; }
            dist = distance(color, c11_6); if(dist < minDist) { minDist = dist; closestColor = c11_6; }
            dist = distance(color, c11_7); if(dist < minDist) { minDist = dist; closestColor = c11_7; }
            dist = distance(color, c11_8); if(dist < minDist) { minDist = dist; closestColor = c11_8; }
            dist = distance(color, c11_9); if(dist < minDist) { minDist = dist; closestColor = c11_9; }
        } else if (paletteChoice == 12){
            dist = distance(color, c12_0); if(dist < minDist) { minDist = dist; closestColor = c12_0; }
            dist = distance(color, c12_1); if(dist < minDist) { minDist = dist; closestColor = c12_1; }
            dist = distance(color, c12_2); if(dist < minDist) { minDist = dist; closestColor = c12_2; }
            dist = distance(color, c12_3); if(dist < minDist) { minDist = dist; closestColor = c12_3; }
            dist = distance(color, c12_4); if(dist < minDist) { minDist = dist; closestColor = c12_4; }
            dist = distance(color, c12_5); if(dist < minDist) { minDist = dist; closestColor = c12_5; }
            dist = distance(color, c12_6); if(dist < minDist) { minDist = dist; closestColor = c12_6; }
            dist = distance(color, c12_7); if(dist < minDist) { minDist = dist; closestColor = c12_7; }
            dist = distance(color, c12_8); if(dist < minDist) { minDist = dist; closestColor = c12_8; }
            dist = distance(color, c12_9); if(dist < minDist) { minDist = dist; closestColor = c12_9; }
        } else if (paletteChoice == 13){
            dist = distance(color, c13_0); if(dist < minDist) { minDist = dist; closestColor = c13_0; }
            dist = distance(color, c13_1); if(dist < minDist) { minDist = dist; closestColor = c13_1; }
            dist = distance(color, c13_2); if(dist < minDist) { minDist = dist; closestColor = c13_2; }
            dist = distance(color, c13_3); if(dist < minDist) { minDist = dist; closestColor = c13_3; }
            dist = distance(color, c13_4); if(dist < minDist) { minDist = dist; closestColor = c13_4; }
            dist = distance(color, c13_5); if(dist < minDist) { minDist = dist; closestColor = c13_5; }
            dist = distance(color, c13_6); if(dist < minDist) { minDist = dist; closestColor = c13_6; }
            dist = distance(color, c13_7); if(dist < minDist) { minDist = dist; closestColor = c13_7; }
            dist = distance(color, c13_8); if(dist < minDist) { minDist = dist; closestColor = c13_8; }
            dist = distance(color, c13_9); if(dist < minDist) { minDist = dist; closestColor = c13_9; }
        } else if (paletteChoice == 14){
            dist = distance(color, c14_0); if(dist < minDist) { minDist = dist; closestColor = c14_0; }
            dist = distance(color, c14_1); if(dist < minDist) { minDist = dist; closestColor = c14_1; }
            dist = distance(color, c14_2); if(dist < minDist) { minDist = dist; closestColor = c14_2; }
            dist = distance(color, c14_3); if(dist < minDist) { minDist = dist; closestColor = c14_3; }
            dist = distance(color, c14_4); if(dist < minDist) { minDist = dist; closestColor = c14_4; }
            dist = distance(color, c14_5); if(dist < minDist) { minDist = dist; closestColor = c14_5; }
            dist = distance(color, c14_6); if(dist < minDist) { minDist = dist; closestColor = c14_6; }
            dist = distance(color, c14_7); if(dist < minDist) { minDist = dist; closestColor = c14_7; }
            dist = distance(color, c14_8); if(dist < minDist) { minDist = dist; closestColor = c14_8; }
            dist = distance(color, c14_9); if(dist < minDist) { minDist = dist; closestColor = c14_9; }
        } else if (paletteChoice == 15){
            dist = distance(color, c15_0); if(dist < minDist) { minDist = dist; closestColor = c15_0; }
            dist = distance(color, c15_1); if(dist < minDist) { minDist = dist; closestColor = c15_1; }
            dist = distance(color, c15_2); if(dist < minDist) { minDist = dist; closestColor = c15_2; }
            dist = distance(color, c15_3); if(dist < minDist) { minDist = dist; closestColor = c15_3; }
            dist = distance(color, c15_4); if(dist < minDist) { minDist = dist; closestColor = c15_4; }
            dist = distance(color, c15_5); if(dist < minDist) { minDist = dist; closestColor = c15_5; }
            dist = distance(color, c15_6); if(dist < minDist) { minDist = dist; closestColor = c15_6; }
            dist = distance(color, c15_7); if(dist < minDist) { minDist = dist; closestColor = c15_7; }
            dist = distance(color, c15_8); if(dist < minDist) { minDist = dist; closestColor = c15_8; }
            dist = distance(color, c15_9); if(dist < minDist) { minDist = dist; closestColor = c15_9; }
        }
        
        return closestColor;
    }

    float mod2(float x, float y) {
        return x - y * floor(x/y);
    }

    // 4x4 Bayer matrix indexed using mod2
    float getBayerValue(vec2 coord) {
        float x = mod2(coord.x, 4.0);
        float y = mod2(coord.y, 4.0);
        
        if(x < 1.0) {
            if(y < 1.0) return 0.0/16.0;
            else if(y < 2.0) return 12.0/16.0;
            else if(y < 3.0) return 3.0/16.0;
            else return 15.0/16.0;
        } 
        else if(x < 2.0) {
            if(y < 1.0) return 8.0/16.0;
            else if(y < 2.0) return 4.0/16.0;
            else if(y < 3.0) return 11.0/16.0;
            else return 7.0/16.0;
        }
        else if(x < 3.0) {
            if(y < 1.0) return 2.0/16.0;
            else if(y < 2.0) return 14.0/16.0;
            else if(y < 3.0) return 1.0/16.0;
            else return 13.0/16.0;
        }
        else {
            if(y < 1.0) return 10.0/16.0;
            else if(y < 2.0) return 6.0/16.0;
            else if(y < 3.0) return 9.0/16.0;
            else return 5.0/16.0;
        }
    }

    void main() {
        vec2 pixelatedCoord = floor(vTexCoord * resolution / pixelSize) * pixelSize / resolution;
        vec4 color = texture2D(uTexture, pixelatedCoord);

        // Edge detection
        float edge = detectEdge(pixelatedCoord);
        bool isEdge = edge > edgeThreshold;

        // Get the dither threshold using screen coordinates
        float threshold = getBayerValue(gl_FragCoord.xy);

        // Apply dithering by adjusting the color before quantization
        vec3 adjustedColor = color.rgb + (threshold - 0.5) * ditherFactor;
        
        // Clamp the adjusted color
        adjustedColor = clamp(adjustedColor, 0.0, 1.0);
        
        // Find the closest color in the palette (skip quantization for 'original' = index 16)
        vec3 quantizedColor = paletteChoice == 16 ? adjustedColor : findClosestColor(adjustedColor);

        // Apply edge highlighting
        if (isEdge) {
            quantizedColor = mix(quantizedColor, edgeColor, edgeIntensity);
        }

        gl_FragColor = vec4(quantizedColor, 1.0);
    }
`;

const temporalBlendFragmentShaderSource = `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uCurrentFrame;
    uniform sampler2D uPreviousFrame;
    uniform float temporalBlend;
    uniform float temporalThreshold;

    void main() {
        // Undo the Y-flip from tex coords — framebuffer textures are already correctly oriented
        vec2 fbCoord = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
        vec4 currentColor = texture2D(uCurrentFrame, fbCoord);
        vec4 previousColor = texture2D(uPreviousFrame, fbCoord);
        float colorDiff = distance(currentColor.rgb, previousColor.rgb);
        vec3 result = mix(
            previousColor.rgb,
            currentColor.rgb,
            smoothstep(temporalThreshold * 0.5, temporalThreshold, colorDiff)
        );
        result = mix(result, currentColor.rgb, 1.0 - temporalBlend);
        gl_FragColor = vec4(result, 1.0);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(shaderProgram));
      throw new Error('Failed to link program');
  }
  return shaderProgram;
}

const program = createProgram(vertexShaderSource, fragmentShaderSource);
const temporalBlendProgram = createProgram(vertexShaderSource, temporalBlendFragmentShaderSource);

// Set up geometry
const positions = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
]);

const texCoords = new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    1, 0,
]);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'position');
const texCoordLocation = gl.getAttribLocation(program, 'texCoord');
const resolutionLocation = gl.getUniformLocation(program, 'resolution');
const pixelSizeLocation = gl.getUniformLocation(program, 'pixelSize');
const ditherFactorLocation = gl.getUniformLocation(program, 'ditherFactor');
const paletteChoiceLocation = gl.getUniformLocation(program, 'paletteChoice');
const edgeThresholdLocation = gl.getUniformLocation(program, 'edgeThreshold');
const edgeIntensityLocation = gl.getUniformLocation(program, 'edgeIntensity');
const edgeColorLocation = gl.getUniformLocation(program, 'edgeColor');
const textureLocation = gl.getUniformLocation(program, 'uTexture');

const temporalPositionLocation = gl.getAttribLocation(temporalBlendProgram, 'position');
const temporalTexCoordLocation = gl.getAttribLocation(temporalBlendProgram, 'texCoord');
const temporalCurrentFrameLocation = gl.getUniformLocation(temporalBlendProgram, 'uCurrentFrame');
const temporalPreviousFrameLocation = gl.getUniformLocation(temporalBlendProgram, 'uPreviousFrame');
const temporalBlendLocation = gl.getUniformLocation(temporalBlendProgram, 'temporalBlend');
const temporalThresholdLocation = gl.getUniformLocation(temporalBlendProgram, 'temporalThreshold');

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
// Initialize with empty texture
gl.texImage2D(
    gl.TEXTURE_2D, 
    0, 
    gl.RGBA, 
    1, 
    1, 
    0, 
    gl.RGBA, 
    gl.UNSIGNED_BYTE, 
    new Uint8Array([0, 0, 0, 255])
);

function createRenderTarget(width, height) {
  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Failed to create framebuffer target');
  }

  return { texture: targetTexture, framebuffer, width, height };
}

let temporalTargets = [];
let temporalCurrentIndex = 0;
let temporalPreviousIndex = 1;
let temporalHistoryValid = false;

function ensureTemporalTargets(width, height) {
  if (
    temporalTargets.length === 2 &&
    temporalTargets[0].width === width &&
    temporalTargets[0].height === height
  ) {
    return;
  }

  temporalTargets = [createRenderTarget(width, height), createRenderTarget(width, height)];
  temporalCurrentIndex = 0;
  temporalPreviousIndex = 1;
  temporalHistoryValid = false;

  temporalTargets.forEach((target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function invalidateTemporalHistory() {
  temporalHistoryValid = false;
}

function bindSharedAttributes(activePositionLocation, activeTexCoordLocation) {
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(activePositionLocation);
  gl.vertexAttribPointer(activePositionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(activeTexCoordLocation);
  gl.vertexAttribPointer(activeTexCoordLocation, 2, gl.FLOAT, false, 0, 0);
}

gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.disable(gl.DEPTH_TEST);

async function setupWebcam() {
  const video = document.createElement('video');

  if(isMobileFlag){
    video.setAttribute('playsinline', '');  // Required for iOS
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('autoplay', '');
    // video.style.transform = 'scaleX(-1)';  // Mirror the video
  }

  try {
      const constraints = {
          video: {
              width: { ideal: 1280 },
              height: { ideal: 720 }
          }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise((resolve) => {
          video.onloadedmetadata = () => {
              video.play().then(() => resolve());
          };
      });
      
      // Set canvas size after video is ready
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      ensureTemporalTargets(canvas.width, canvas.height);
      invalidateTemporalHistory();
      
      return video;
  } catch (err) {
      console.error('Error accessing camera:', err);
      throw err;
  }
}

function render() {
  drawScene();
  animationRequest = requestAnimationFrame(render);
}

function drawScene(){
  if (!currentVideo || currentVideo.paused) {
      return;
  }

  // Don't attempt texImage2D unless the video has actual frame data
  if (currentVideo.readyState < 2) {
      return;
  }

  animationPlayToggle = true;
  ensureTemporalTargets(canvas.width, canvas.height);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, currentVideo);
  } catch (e) {
      // Cross-origin or security error — stop the render loop entirely
      console.warn('Video source unusable (likely CORS). Stopping render.');
      currentVideo.pause();
      cancelAnimationFrame(animationRequest);
      animationPlayToggle = false;
      return;
  }

  const currentTarget = temporalTargets[temporalCurrentIndex];
  const previousTarget = temporalTargets[temporalPreviousIndex];

  gl.bindFramebuffer(gl.FRAMEBUFFER, currentTarget.framebuffer);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform1i(textureLocation, 0);
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(pixelSizeLocation, parseFloat(obj.pixelSize));
  gl.uniform1f(ditherFactorLocation, parseFloat(obj.ditherFactor));
  gl.uniform1f(edgeThresholdLocation, parseFloat(obj.edgeThreshold));
  gl.uniform1f(edgeIntensityLocation, parseFloat(obj.edgeIntensity));
  gl.uniform3f(
      edgeColorLocation,
      obj.edgeColor[0] / 255.0,
      obj.edgeColor[1] / 255.0,
      obj.edgeColor[2] / 255.0,
  );

  let paletteValue = paletteNames.indexOf(obj.colorPalette);
  if (paletteValue < 0) {
      paletteValue = 0;
  }
  gl.uniform1i(paletteChoiceLocation, paletteValue);
  bindSharedAttributes(positionLocation, texCoordLocation);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(temporalBlendProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, currentTarget.texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, previousTarget.texture);
  gl.uniform1i(temporalCurrentFrameLocation, 0);
  gl.uniform1i(temporalPreviousFrameLocation, 1);
  gl.uniform1f(temporalBlendLocation, temporalHistoryValid ? parseFloat(obj.temporalBlend) : 0.0);
  gl.uniform1f(temporalThresholdLocation, parseFloat(obj.temporalThreshold));
  bindSharedAttributes(temporalPositionLocation, temporalTexCoordLocation);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, currentTarget.texture);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, canvas.width, canvas.height);
  gl.bindTexture(gl.TEXTURE_2D, null);

  temporalHistoryValid = true;
  temporalCurrentIndex = temporalCurrentIndex === 0 ? 1 : 0;
  temporalPreviousIndex = temporalPreviousIndex === 0 ? 1 : 0;
}

// Handle video source cleanup
function cleanupVideoSource() {
  if (currentVideo) {
      currentVideo.pause();
      if (currentVideo.srcObject) {
          // Stop webcam stream
          const tracks = currentVideo.srcObject.getTracks();
          tracks.forEach(track => track.stop());
          currentVideo.srcObject = null;
      } else if (currentVideo.src) {
          // Clean up uploaded video
          URL.revokeObjectURL(currentVideo.src);
          currentVideo.src = '';
      }
      currentVideo = null;
  }
  invalidateTemporalHistory();
}

function useWebcam(){
  cleanupVideoSource();
  setupWebcam().then(video => {
      currentVideo = video;
      animationPlayToggle = true;
      // animationRequest = render(video);
      render();
  }).catch(err => {
      console.error('Failed to start webcam:', err);
  });
}

fileInput.addEventListener('change', (e) => {
  cleanupVideoSource();
  if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      userVideo.src = url;
      userVideo.addEventListener('loadedmetadata', () => {
          
          userVideo.width = userVideo.videoWidth;
          userVideo.height = userVideo.videoHeight;
          console.log("user video width/height: "+userVideo.width+", "+userVideo.height);

          let canvasWidth = Math.min(userVideo.videoWidth, maxCanvasWidth);
          let canvasHeight = Math.floor(canvasWidth * (userVideo.videoHeight / userVideo.videoWidth)); 
  
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          console.log("canvas width/height: "+canvas.width+", "+canvas.height);

          gl.viewport(0, 0, canvas.width, canvas.height);
          ensureTemporalTargets(canvas.width, canvas.height);
          invalidateTemporalHistory();

      });

      setTimeout(function(){
        userVideo.play();
        currentVideo = userVideo;
        render();
      },1000);
  }
    
});

// --- URL video loading ---
const urlInput = document.getElementById('urlInput');
const urlHint = document.getElementById('urlHint');

const SOCIAL_PATTERNS = [
  { re: /youtu\.?be(\.com)?/i,       name: 'YouTube' },
  { re: /twitter\.com|x\.com/i,       name: 'Twitter/X' },
  { re: /tiktok\.com/i,               name: 'TikTok' },
  { re: /instagram\.com/i,            name: 'Instagram' },
  { re: /facebook\.com|fb\.watch/i,   name: 'Facebook' },
  { re: /vimeo\.com/i,                name: 'Vimeo' },
  { re: /twitch\.tv/i,                name: 'Twitch' },
  { re: /reddit\.com/i,               name: 'Reddit' },
  { re: /dailymotion\.com/i,          name: 'Dailymotion' },
  { re: /soundcloud\.com/i,           name: 'SoundCloud' },
];

function detectSocialPlatform(url) {
  for (const p of SOCIAL_PATTERNS) {
    if (p.re.test(url)) return p.name;
  }
  return null;
}

function showUrlHint(msg, isError, isHtml) {
  if (isHtml) {
    urlHint.innerHTML = msg;
  } else {
    urlHint.textContent = msg;
  }
  urlHint.className = isError ? 'url-hint-error' : 'url-hint-info';
  urlHint.classList.remove('hidden');
}

function hideUrlHint() {
  urlHint.classList.add('hidden');
}

// Detect if we're running from the local server (enables yt-dlp proxy)
const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function loadVideoFromUrl() {
  const raw = (urlInput.value || '').trim();
  if (!raw) {
    showUrlHint('Paste a video URL first.', true);
    return;
  }

  hideUrlHint();
  cleanupVideoSource();

  const platform = detectSocialPlatform(raw);

  if (platform && isLocalServer) {
    // Route through local yt-dlp proxy
    loadViaProxy(raw, platform);
  } else if (platform) {
    // No server available — show guidance
    showUrlHint(
      `That's a ${platform} link. Start the local server (<code>node server.js</code>) to stream directly,<br>`
      + `or download the .mp4 from <a href="https://cobalt.tools" target="_blank" rel="noopener">cobalt.tools</a> and upload it.`,
      true,
      true
    );
  } else {
    // Direct video URL — try loading it straight
    attemptLoadUrl(raw, false);
  }
}

function loadViaProxy(originalUrl, platform) {
  showUrlHint(`Downloading ${platform} video\u2026 0%`, false);

  // Step 1: Start the download on the server
  fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: originalUrl }),
  })
  .then((r) => {
    if (!r.ok) throw new Error('Server rejected the request');
    return r.json();
  })
  .then(({ id }) => {
    // Step 2: Listen to SSE progress stream
    const evtSource = new EventSource(`/api/status/${id}`);

    evtSource.onmessage = (evt) => {
      const data = JSON.parse(evt.data);

      if (data.status === 'downloading') {
        showUrlHint(`Downloading ${platform} video\u2026 ${data.progress}`, false);
      }

      if (data.status === 'ready') {
        evtSource.close();
        showUrlHint('Download complete \u2014 loading video\u2026', false);
        playDownloadedVideo(id);
      }

      if (data.status === 'error') {
        evtSource.close();
        const isCookieIssue = (data.error || '').includes('cookies') || (data.error || '').includes('authentication');
        const hint = isCookieIssue
          ? `${data.error}<br><br>`
            + `<strong>How to fix:</strong> Install the `
            + `<a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" rel="noopener">Get cookies.txt LOCALLY</a> `
            + `Chrome extension, go to youtube.com while logged in, export cookies, and save the file as <code>cookies.txt</code> `
            + `next to <code>server.js</code>. Then restart the server.`
          : `Download failed: ${data.error || 'unknown error'}.<br>`
            + `Try <a href="https://cobalt.tools" target="_blank" rel="noopener">cobalt.tools</a> to download the video manually.`;
        showUrlHint(hint, true, true);
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      showUrlHint('Lost connection to server. Is <code>node server.js</code> still running?', true, true);
    };
  })
  .catch((err) => {
    showUrlHint(
      `Could not reach the local server: ${err.message}.<br>Make sure <code>node server.js</code> is running.`,
      true, true
    );
  });
}

function playDownloadedVideo(jobId) {
  const videoSrc = `/api/video/${jobId}`;

  userVideo.removeAttribute('crossOrigin');
  userVideo.src = videoSrc;

  const onReady = () => {
    cleanup();
    userVideo.width = userVideo.videoWidth;
    userVideo.height = userVideo.videoHeight;

    let canvasWidth = Math.min(userVideo.videoWidth, maxCanvasWidth);
    let canvasHeight = Math.floor(canvasWidth * (userVideo.videoHeight / userVideo.videoWidth));

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    ensureTemporalTargets(canvas.width, canvas.height);
    invalidateTemporalHistory();

    userVideo.play();
    currentVideo = userVideo;
    render();
    hideUrlHint();
  };

  const onError = () => {
    cleanup();
    showUrlHint('Video downloaded but failed to load. The format may be unsupported by your browser.', true);
  };

  function cleanup() {
    userVideo.removeEventListener('loadedmetadata', onReady);
    userVideo.removeEventListener('error', onError);
  }

  userVideo.addEventListener('loadedmetadata', onReady);
  userVideo.addEventListener('error', onError);
  userVideo.load();
}

function attemptLoadUrl(url, isProxy) {
  showUrlHint(isProxy ? 'Trying CORS proxy\u2026' : 'Loading\u2026', false);

  userVideo.crossOrigin = 'anonymous';
  userVideo.src = url;

  const onReady = () => {
    cleanup();
    userVideo.width = userVideo.videoWidth;
    userVideo.height = userVideo.videoHeight;

    let canvasWidth = Math.min(userVideo.videoWidth, maxCanvasWidth);
    let canvasHeight = Math.floor(canvasWidth * (userVideo.videoHeight / userVideo.videoWidth));

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    ensureTemporalTargets(canvas.width, canvas.height);
    invalidateTemporalHistory();

    userVideo.play();
    currentVideo = userVideo;
    render();
    hideUrlHint();
  };

  const onError = () => {
    cleanup();
    if (!isProxy) {
      const proxied = 'https://corsproxy.io/?' + encodeURIComponent(url);
      attemptLoadUrl(proxied, true);
    } else {
      showUrlHint(
        'Could not load that URL. Download the video file first and upload it, '
        + 'or use <a href="https://cobalt.tools" target="_blank" rel="noopener">cobalt.tools</a> to grab the .mp4.',
        true,
        true
      );
    }
  };

  function cleanup() {
    userVideo.removeEventListener('loadedmetadata', onReady);
    userVideo.removeEventListener('error', onError);
  }

  userVideo.addEventListener('loadedmetadata', onReady);
  userVideo.addEventListener('error', onError);
  userVideo.load();
}

// Allow pressing Enter in the URL field
urlInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadVideoFromUrl();
  }
});

function startDefaultVideo(){
  if(animationPlayToggle==true){
      playAnimationToggle = false;
      cancelAnimationFrame(animationRequest);
      console.log("cancel animation");
  }

  let canvasWidth = defaultVideoWidth;
  let canvasHeight = defaultVideoHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  defaultVideo.play();

  gl.viewport(0, 0, canvas.width, canvas.height);
  ensureTemporalTargets(canvas.width, canvas.height);
  invalidateTemporalHistory();
  playAnimationToggle = true;

  currentVideo = defaultVideo;
  render();
}

function toggleAnimationPlay(){
  if(animationPlayToggle){
    currentVideo.pause();
    cancelAnimationFrame(animationRequest);
  } else {
    currentVideo.play();
    // animationRequest = render(currentVideo);
    render();
  }
  animationPlayToggle = !animationPlayToggle;
}

function toggleGUI(){
  if(guiOpenToggle == false){
      gui.open();
      guiOpenToggle = true;
  } else {
      gui.close();
      guiOpenToggle = false;
  }
}
  
//shortcut hotkey presses
document.addEventListener('keydown', function(event) {
  // Don't trigger hotkeys when typing in an input field
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  if (event.key === 's') {
      saveImage();
  } else if (event.key === 'v') {
      toggleVideoRecord();
  } else if (event.key === 'o') {
      toggleGUI();
  } else if (event.key === 'p') {
    toggleAnimationPlay();
  } else if(event.key === 'r'){
    randomizeInputs();
  }
  
});

function randomizeInputs(){
  obj.pixelSize = Math.ceil(Math.pow(Math.random(),4)*32);
  obj.ditherFactor = Math.pow(Math.random(),2);
  obj.colorPalette = paletteNames[Math.round(Math.random()*(paletteNames.length-1))];
  obj.edgeThreshold = Math.random() * 0.49 + 0.01;
  obj.edgeIntensity = Math.random();
  obj.temporalBlend = Math.random();
  obj.temporalThreshold = Math.random() * 0.39 + 0.01;

  // Generate random RGB color for edges
  obj.edgeColor = [
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
  ];

  markPresetAsCustom();
  refreshGuiControllers();
}

//MAIN METHOD
setInterval(startDefaultVideo(),1000);
