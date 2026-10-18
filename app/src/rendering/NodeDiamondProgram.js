import { drawDiscNodeLabel, NodeProgram } from 'sigma/rendering';
import { floatColor } from 'sigma/utils';

// language=GLSL
const FRAGMENT_SHADER_SOURCE = /*glsl*/`
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;

// language=GLSL
const VERTEX_SHADER_SOURCE = /*glsl*/`
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_cameraAngle;
uniform float u_correctionRatio;

varying vec4 v_color;

const float bias = 255.0 / 254.0;
const float scale = 2.2;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * scale;
  float angle = a_angle + u_cameraAngle; 
  vec2 diffVector = size * vec2(cos(angle), sin(angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_cameraAngle", "u_matrix"];
const PI = Math.PI;

function drawDiamondNodeHover(context, data, settings) {
  const size = settings.labelSize || 14;
  const font = settings.labelFont || "Arial";
  const weight = settings.labelWeight || "normal";
  context.font = `${weight} ${size}px ${font}`;

  const nodeSize = (data.size || 5) * 1.5;
  context.beginPath();
  context.moveTo(data.x, data.y - nodeSize);
  context.lineTo(data.x + nodeSize, data.y);
  context.lineTo(data.x, data.y + nodeSize);
  context.lineTo(data.x - nodeSize, data.y);
  context.closePath();
  context.fillStyle = data.color || settings.defaultNodeColor;
  context.fill();

  drawDiscNodeLabel(context, data, settings);
}

export class NodeDiamondProgram extends NodeProgram {
  constructor(...args) {
    super(...args);
    this.drawHover = drawDiamondNodeHover;
    this.drawLabel = drawDiscNodeLabel;
  }

  getDefinition() {
    return {
      VERTICES: 6,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: WebGLRenderingContext.FLOAT },
        { name: "a_size", size: 1, type: WebGLRenderingContext.FLOAT },
        { name: "a_color", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
        { name: "a_id", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [
        { name: "a_angle", size: 1, type: WebGLRenderingContext.FLOAT }
      ],
      // 2 Triangles forming a diamond (rhombus):
      // Triangle 1: Right (0), Top (PI/2), Bottom (-PI/2)
      // Triangle 2: Left (PI), Top (PI/2), Bottom (-PI/2)
      CONSTANT_DATA: [
        [0],
        [PI / 2],
        [-PI / 2],
        [PI],
        [PI / 2],
        [-PI / 2]
      ]
    };
  }

  processVisibleItem(nodeIndex, startIndex, data) {
    const array = this.array;
    const color = floatColor(data.color);
    array[startIndex++] = data.x;
    array[startIndex++] = data.y;
    array[startIndex++] = data.size;
    array[startIndex++] = color;
    array[startIndex++] = nodeIndex;
  }

  setUniforms(params, { gl, uniformLocations }) {
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
  }
}
