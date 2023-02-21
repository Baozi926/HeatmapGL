/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} radius
 * @param {number} width
 * @param {height} height
 * @param {object} data
 * @param {object} gradient
 *
 */
export class Heatmap {
  constructor({ canvas, radius, width = 1000, height = 1000, data, gradient }) {
    // this.gl = gl;
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl");
    this.radius = radius || 10;
    this.densityProgram = this.getDensityProgram(this.gl);

    this.data = data;
    //注意，width和height与canvas的高宽无关，是纯数据的
    this.width = width;
    this.height = height;

    this.textureDensitymap = this.gl.createTexture();

    this._gradientCanvas =
      gradient instanceof HTMLCanvasElement
        ? gradient
        : getGradient(gradient, {});

    this.fbo = this.initFramebufferObject(this.gl, {
      width: this.canvas.width,
      height: this.canvas.height,
      texture: this.textureDensitymap,
    });

    this.locationDepthmap = this.gl.getUniformLocation(
      this.densityProgram,
      "u_density_map"
    );

    this.radiusLocation = this.gl.getUniformLocation(
      this.densityProgram,
      "u_radius"
    );

    this.a_Position_density_location = this.gl.getAttribLocation(
      this.densityProgram,
      "a_Position"
    );

    this.heatmapProgram = this.getHeatmapProgram(this.gl);
  }

  loadShader(gl, type, source) {
    // Create shader object
    var shader = gl.createShader(type);
    if (shader == null) {
      console.log("unable to create shader");
      return null;
    }

    // Set the shader program
    gl.shaderSource(shader, source);

    // Compile the shader
    gl.compileShader(shader);

    // Check the result of compilation
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
      var error = gl.getShaderInfoLog(shader);
      console.log("Failed to compile shader: " + error);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
  initShaders(gl, vsrc, fsrc) {
    // Create shader object
    var vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsrc);
    var fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vertexShader || !fragmentShader) {
      return null;
    }

    // Create a program object
    var program = gl.createProgram();
    if (!program) {
      return null;
    }

    // Attach the shader objects
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Link the program object
    gl.linkProgram(program);

    // Check the result of linking
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      var error = gl.getProgramInfoLog(program);
      console.log("Failed to link program: " + error);
      gl.deleteProgram(program);
      gl.deleteShader(fragmentShader);
      gl.deleteShader(vertexShader);
      return null;
    }
    return program;
  }

  /**
   *
   *  render one time
   *
   */
  draw() {
    const gl = this.gl;

    const { width, height } = this.canvas;

    if (!this.fbo) {
      console.log("Failed to intialize the framebuffer object (FBO)");
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // gl.linkProgram(this.densityProgram);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.drawDensitymap(gl, this.densityProgram, {
      radius: this.radius,
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); //将绘制目标切换为颜色缓冲区

    gl.bindTexture(gl.TEXTURE_2D, this.textureDensitymap);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.drawHeatmap(gl, this.heatmapProgram, this._gradientCanvas);
  }
  getHeatmapProgram(gl) {
    /*第一部分顶点着色器接收顶点的纹理坐标，传递给片元着色器*/
    var VSHADER_SOURCE =
      "" +
      "attribute vec4 a_Position;" + //
      "attribute vec2 a_TexCoord;" + //
      "varying vec2 v_TexCoord;" + //
      "void main(){" +
      "   gl_Position = a_Position;" +
      "   v_TexCoord = a_TexCoord;" + //
      "}";

    var FSHADER_SOURCE =
      "" +
      "precision mediump float;" +
      "uniform sampler2D u_density_map;" +
      "uniform sampler2D u_ramplColor;" +
      "varying vec2 v_TexCoord;" +
      "void main(){" +
      "   vec4 color = texture2D(u_density_map,v_TexCoord);" +
      "   float value =  color.r; " +
      "   vec4 c =  texture2D(u_ramplColor, vec2(value , 0.5)); " +
      `   gl_FragColor =  c;` +
      "}";

    return this.initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  }

  drawHeatmap(gl, program, rampColorCanvas) {
    gl.useProgram(program);
    //四个绘制顶点 和 原图的对应位置关系
    var verticesSizes = new Float32Array([
      -1,
      1,
      0.0,
      1.0,
      -1,
      -1,
      0.0,
      0.0,
      1,
      1,
      1.0,
      1.0,
      1,
      -1,
      1.0,
      0.0,
    ]);

    var n = 4;
    var vertexSizeBuffer = gl.createBuffer();
    if (!vertexSizeBuffer) {
      console.log("无法创建缓冲区");
      return -1;
    }
    // 是设置缓冲为当前使用缓冲
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexSizeBuffer);
    // 将数据拷贝到缓冲
    gl.bufferData(gl.ARRAY_BUFFER, verticesSizes, gl.STATIC_DRAW);

    // 询问顶点数据应该放在哪里,获取 WebGL 给属性分配的地址
    var a_Position = gl.getAttribLocation(program, "a_Position");

    if (a_Position < 0) {
      console.log("无法获取到存储位置");
      return;
    }

    //获取数组一个值所占的字节数
    var fsize = verticesSizes.BYTES_PER_ELEMENT;

    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, fsize * 4, 0);
    gl.enableVertexAttribArray(a_Position);

    //将顶点的纹理坐标分配给a_TexCoord并开启它
    var a_TexCoord = gl.getAttribLocation(program, "a_TexCoord");
    if (a_TexCoord < 0) {
      console.log("无法获取到存储位置");
      return;
    }

    //将纹理坐标赋值
    gl.vertexAttribPointer(
      a_TexCoord,
      2,
      gl.FLOAT,
      false,
      fsize * 4,
      fsize * 2
    );
    gl.enableVertexAttribArray(a_TexCoord);

    // var texture = gl.createTexture(); //创建纹理对象
    // if (!texture) {
    //   console.log("无法创建纹理对象");
    //   return;
    // }
    gl.activeTexture(gl.TEXTURE0, null);
    //获取u_Sampler的存储位置
    var u_sampler = gl.getUniformLocation(program, "u_density_map");
    gl.uniform1i(u_sampler, 0);
    if (u_sampler < 0) {
      console.log("无法获取变量的存储位置");
      return;
    }

    let rampColor;

    if (this.rampColorTexture) {
      rampColor = this.rampColorTexture;
    } else {
      //--start load color ramp
      rampColor = new Texture(gl, {
        channels: "rgba",
      })
        .bind(1)
        .setSize(256, 1)
        .nearest()
        .clampToEdge();

      rampColor.upload(rampColorCanvas);

      // rampColor.bind(1);
      this.rampColorTexture = rampColor;
    }

    const location_rampColor = gl.getUniformLocation(program, "u_ramplColor");

    gl.uniform1i(location_rampColor, 1);

    gl.activeTexture(gl.TEXTURE0, null);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, n);

    // rampColor.destroy()
  }

  getDensityProgram(gl) {
    var VSHADER_SOURCE = `
    attribute vec4 a_Position;
    varying float v_weight;
    const highp float ZERO = 1.0 / 255.0 / 16.0;
    uniform float u_radius;
    void main() {
      gl_Position = a_Position ;
      gl_PointSize = u_radius;
      v_weight = a_Position.z;
    }
  `;
    var FSHADER_SOURCE = `
        #ifdef GL_ES
        precision mediump float;
        #endif
        const highp float ZERO = 1.0 / 255.0 / 16.0;
        const highp  float GAUSS_COEF = 0.3989422804014327;
        varying float v_weight;
        uniform sampler2D gradientTexture;
          void main() {
              float weight = v_weight;
              float u_intensity = 2.0;

              vec2 st = gl_PointCoord.xy;

              float pct = 0.0;

              float S = sqrt(-2.0 * log(ZERO / weight / u_intensity / GAUSS_COEF)) / 3.0;
              float distance = distance(st,vec2(0.5)) * 2.0;  // 把距离规整到0 到1 之间

              pct = distance * S;

              float d = -0.5 * 3.0 * 3.0 * dot(pct, pct);
              float val = weight * u_intensity * 0.3989422804014327 * exp(d);
              vec4 color =  texture2D(gradientTexture, vec2(val * 100.0, 0.5));
              gl_FragColor = vec4(val, 1.0, 1.0, 1.0);

          }
  `;

    // var canvas = document.getElementById("density-image");
    // var gl = canvas.getContext("webgl");

    // const vbo = createFOB(gl, canvas.width, canvas.height);

    const program = this.initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE);
    return program;
  }

  drawDensitymap(gl, program, { radius }) {
    gl.useProgram(program);
    if (!gl) {
      console.log("Failed to retrieve the <canvas> element");
      return;
    }

    if (!program) {
      console.log("Failed to intialize shaders.");
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendColor(0.0, 0.0, 0.0, 0.0);

    //cahce positions
    if (!this._positionsCache || !this._weightsCache) {
      var vertices = [];


      const canvasWidth = this.width;
      const canvasHeight = this.height;

      const halfCanvasWidth = canvasWidth / 2;
      const halfCanvasHeight = canvasHeight / 2;

      this.data.forEach((v) => {
        vertices.push((v.x - halfCanvasWidth) / halfCanvasWidth);
        vertices.push((v.y - halfCanvasHeight) / halfCanvasHeight);
        vertices.push(v.value);
        // weightArr.push(v.value);
      });

      this._positionsCache = new Float32Array(vertices);

    }

    const positions = this._positionsCache;



    gl.uniform1f(this.radiusLocation, radius);

    //start position
    var a_Position = gl.getAttribLocation(program, "a_Position");
    if (a_Position < 0) {
      console.log("Failed to get the storage location of a_Position");
      return -1;
    }

    const a_PositionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, a_PositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
    //end position


    gl.drawArrays(gl.POINTS, 0, positions.length / 3);
  }

  initFramebufferObject(gl, { width, height, texture }) {
    var framebuffer, texture, depthBuffer;

    // Define the error handling function
    var error = function () {
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (texture) gl.deleteTexture(texture);
      if (depthBuffer) gl.deleteRenderbuffer(depthBuffer);
      return null;
    };

    // 创建帧缓冲区对象 (FBO)
    framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      console.log("Failed to create frame buffer object");
      return error();
    }

    // 创建纹理对象并设置其尺寸和参数
    // 创建纹理对象
    if (!texture) {
      console.log("Failed to create texture object");
      return error();
    }
    gl.bindTexture(gl.TEXTURE_2D, texture); // Bind the object to target
    // gl.pixelStorei(gl.UNPACK_ALIGNMENT, 0);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    // 设置纹理参数
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // // 创建渲染缓冲区对象并设置其尺寸和参数
    // depthBuffer = gl.createRenderbuffer(); //创建渲染缓冲区
    // if (!depthBuffer) {
    //   console.log("Failed to create renderbuffer object");
    //   return error();
    // }
    // gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer); // Bind the object to target
    // gl.renderbufferStorage(
    //   gl.RENDERBUFFER,
    //   gl.DEPTH_COMPONENT16,
    //   width,
    //   height
    // );

    // 将纹理和渲染缓冲区对象关联到帧缓冲区对象上
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    ); //关联颜色
    // gl.framebufferRenderbuffer(
    //   gl.FRAMEBUFFER,
    //   gl.DEPTH_ATTACHMENT,
    //   gl.RENDERBUFFER,
    //   depthBuffer
    // ); //关联深度

    // 检查帧缓冲区是否被正确设置
    // var e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    // if (gl.FRAMEBUFFER_COMPLETE !== e) {
    //   console.log("Frame buffer object is incomplete: " + e.toString());
    //   return error();
    // }

    // Unbind the buffer object
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // gl.bindTexture(gl.TEXTURE_2D, null);

    return framebuffer;
  }
}

class Texture {
  channels;

  type;

  chancount;

  target;
  handle;
  width;
  height;

  constructor(gl, params) {
    if (params == null) {
      params = {};
    }

    this.gl = gl;

    const ref = (params.channels ?? "rgba").toUpperCase();
    this.channels = this.gl[ref];

    if (typeof params.type === "number") {
      this.type = params.type;
    } else {
      const ref1 = `${params.type ?? "unsigned_byte"}`.toUpperCase();
      this.type = this.gl[ref1];
    }

    switch (this.channels) {
      case this.gl.RGBA:
        this.chancount = 4;
        break;
      case this.gl.RGB:
        this.chancount = 3;
        break;
      case this.gl.LUMINANCE_ALPHA:
        this.chancount = 2;
        break;
      default:
        this.chancount = 1;
    }

    this.target = this.gl.TEXTURE_2D;
    this.handle = this.gl.createTexture();
    this.width = 0;
    this.height = 0;
  }

  destroy() {
    return this.gl.deleteTexture(this.handle);
  }

  bind(unit) {
    if (unit == null || unit < 0) {
      unit = 0;
    }
    if (unit > 15) {
      throw "Texture unit too large: " + unit;
    }
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.target, this.handle);
    return this;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.gl.texImage2D(
      this.target,
      0,
      this.channels,
      this.width,
      this.height,
      0,
      this.channels,
      this.type,
      null
    );
    return this;
  }

  upload(data) {
    this.width = data.width;
    this.height = data.height;
    this.gl.texImage2D(
      this.target,
      0,
      this.channels,
      this.channels,
      this.type,
      data
    );
    return this;
  }

  linear() {
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    return this;
  }

  nearest() {
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST
    );
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST
    );
    return this;
  }

  clampToEdge() {
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.target,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    return this;
  }

  repeat() {
    this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
    this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
    return this;
  }
}

export function getGradient(gradient, { canvas, width = 256, height = 1 }) {
  const defaultGradient = {
    0: "rgb(0,0,255,0)",
    0.25: "rgb(0,0,255)",
    0.55: "rgb(0,255,0)",
    0.85: "yellow",
    1.0: "rgb(255,0,0)",
  };

  var gradientConfig = gradient || defaultGradient;
  var paletteCanvas = canvas || document.createElement("canvas");
  var paletteCtx = paletteCanvas.getContext("2d");

  paletteCanvas.width = width;
  paletteCanvas.height = height;

  const gradientBar = paletteCtx.createLinearGradient(
    0,
    height / 2,
    width,
    height / 2
  );
  for (var key in gradientConfig) {
    gradientBar.addColorStop(parseFloat(key), gradientConfig[key]);
  }

  paletteCtx.fillStyle = gradientBar;
  paletteCtx.fillRect(0, 0, width, height);

  return paletteCanvas;
}
