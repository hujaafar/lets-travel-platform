/** Small, on-demand WebGL sphere. No animation loop, scene library, or remote requests. */
export function createOrbitGlobe(
  canvas: HTMLCanvasElement,
  source: string,
  ready: () => void,
) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `precision highp float;
    varying vec2 uv; uniform sampler2D earth; uniform float angle;
    void main(){
      vec2 p=uv*1.09; float r=dot(p,p);
      if(r>1.) {float a=exp(-(sqrt(r)-1.)*68.)*.32;
        gl_FragColor=vec4(.35,.65,.95,a);return;}
      vec3 n=vec3(p,sqrt(1.-r));
      float tilt=-.21; vec3 q=vec3(n.x,cos(tilt)*n.y-sin(tilt)*n.z,sin(tilt)*n.y+cos(tilt)*n.z);
      float longitude=atan(q.x,q.z)+angle;
      vec2 t=vec2(fract(longitude/6.2831853+.5),.5-asin(q.y)/3.14159265);
      vec3 c=texture2D(earth,t).rgb;
      float light=max(0.,dot(n,normalize(vec3(-.65,.45,.65))));
      c*=.13+light*.98;
      float rim=pow(1.-n.z,3.5);
      c+=vec3(.12,.35,.56)*rim*(.35+light);
      gl_FragColor=vec4(c,smoothstep(1.,.996,r));
    }`;
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(shader);
      return null;
    }
    return shader;
  }
  const vs = compile(gl.VERTEX_SHADER, vertex),
    fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const angle = gl.getUniformLocation(program, "angle");
  let loaded = false,
    disposed = false;
  const image = new Image();
  image.onload = () => {
    if (disposed || gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    loaded = true;
    ready();
  };
  image.src = source;
  return {
    draw(rotation: number) {
      if (!loaded || disposed || gl.isContextLost()) return false;
      const size = Math.min(
        1200,
        Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 1.5)),
      );
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      gl.viewport(0, 0, size, size);
      gl.uniform1f(angle, rotation);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    },
    dispose() {
      disposed = true;
      image.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
