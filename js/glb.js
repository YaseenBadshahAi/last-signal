/* ============================================================
   LSGLB — minimal GLB/glTF 2.0 loader for the rigged soldier.
   Handles: nodes, skinned meshes (JOINTS_0/WEIGHTS_0), skeletons,
   PBR materials (no textures), rotation/translation/scale clips.
   Keeps the game on UMD three.js (works from file:// too).
   ============================================================ */
window.LSGLB = (function () {
  'use strict';

  var COMP_ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  var COMP_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  var ATTR_MAP = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', TEXCOORD_1: 'uv1', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight' };

  function fail(msg) { throw new Error('[LSGLB] ' + msg); }

  // Parse a raw GLB ArrayBuffer -> { scene: THREE.Group, animations: [THREE.AnimationClip] }
  function parse(buffer) {
    var dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546C67) fail('not a GLB file');
    var jsonLen = dv.getUint32(12, true);
    var json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen)));

    var bin = null, off = 20 + jsonLen;
    while (off + 8 <= buffer.byteLength) {
      var clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
      if (ctype === 0x004E4942) bin = buffer.slice(off + 8, off + 8 + clen);
      off += 8 + clen;
    }
    if (!bin) fail('GLB has no BIN chunk');

    function accessor(idx) {
      var acc = json.accessors[idx];
      var bv = json.bufferViews[acc.bufferView || 0];
      var byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      var Arr = COMP_ARRAYS[acc.componentType];
      if (!Arr) fail('unsupported componentType ' + acc.componentType);
      var n = COMP_SIZE[acc.type];
      if (!n) fail('unsupported accessor type ' + acc.type);
      return { array: new Arr(bin, byteOffset, acc.count * n), count: acc.count, size: n };
    }

    function material(mi) {
      var m = (json.materials || [])[mi] || {};
      var pbr = m.pbrMetallicRoughness || {};
      var c = pbr.baseColorFactor || [1, 1, 1, 1];
      var mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c[0], c[1], c[2]),
        metalness: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 0.1,
        roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 0.8
      });
      if (m.name) mat.name = m.name;
      if (m.doubleSided) mat.side = THREE.DoubleSide;
      return mat;
    }

    // Mark which nodes are joints so they become THREE.Bone
    var jointSet = {};
    (json.skins || []).forEach(function (s) { (s.joints || []).forEach(function (j) { jointSet[j] = true; }); });

    // Build node objects
    var nodeObjs = json.nodes.map(function (n, i) {
      var o = jointSet[i] ? new THREE.Bone() : new THREE.Object3D();
      o.name = n.name || ('node_' + i);
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      return o;
    });
    json.nodes.forEach(function (n, i) {
      (n.children || []).forEach(function (c) { nodeObjs[i].add(nodeObjs[c]); });
    });

    // Build meshes (skinned where the node references a skin)
    var skinned = [];
    json.nodes.forEach(function (n, i) {
      if (n.mesh === undefined) return;
      var jm = json.meshes[n.mesh];
      jm.primitives.forEach(function (p) {
        var geo = new THREE.BufferGeometry();
        Object.keys(p.attributes).forEach(function (gltfName) {
          var acc = accessor(p.attributes[gltfName]);
          var threeName = ATTR_MAP[gltfName] || gltfName.toLowerCase();
          geo.setAttribute(threeName, new THREE.BufferAttribute(acc.array, acc.size));
        });
        if (p.indices !== undefined) {
          var ia = accessor(p.indices);
          geo.setIndex(new THREE.BufferAttribute(ia.array, 1));
        }
        var mat = material(p.material !== undefined ? p.material : 0);
        var mesh;
        if (n.skin !== undefined) {
          mesh = new THREE.SkinnedMesh(geo, mat);
          mesh.userData.skinIdx = n.skin;
          mesh.normalizeSkinWeights();
          skinned.push(mesh);
        } else {
          mesh = new THREE.Mesh(geo, mat);
        }
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        nodeObjs[i].add(mesh);
      });
    });

    // Assemble scene
    var scene = new THREE.Group();
    scene.name = 'glb_root';
    var sceneDef = (json.scenes || [])[(json.scene !== undefined ? json.scene : 0)] || {};
    (sceneDef.nodes || []).forEach(function (ni) { scene.add(nodeObjs[ni]); });
    scene.updateMatrixWorld(true);

    // Bind skeletons
    skinned.forEach(function (mesh) {
      var s = json.skins[mesh.userData.skinIdx];
      var bones = s.joints.map(function (j) { return nodeObjs[j]; });
      var ibm = accessor(s.inverseBindMatrices);
      var inverses = [];
      for (var k = 0; k < s.joints.length; k++) {
        var m4 = new THREE.Matrix4();
        m4.fromArray(ibm.array, k * 16);
        inverses.push(m4);
      }
      mesh.bind(new THREE.Skeleton(bones, inverses));
    });

    // Build animation clips
    var clips = (json.animations || []).map(function (a) {
      var tracks = [];
      a.channels.forEach(function (ch) {
        var sampler = a.samplers[ch.sampler];
        var node = nodeObjs[ch.target.node];
        var input = accessor(sampler.input);
        var output = accessor(sampler.output);
        var times = Array.prototype.slice.call(input.array);
        var values = Array.prototype.slice.call(output.array);
        var track = null;
        if (ch.target.path === 'rotation') track = new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, values);
        else if (ch.target.path === 'translation' || ch.target.path === 'scale') track = new THREE.VectorKeyframeTrack(node.name + '.' + ch.target.path, times, values);
        if (!track) return;
        if (sampler.interpolation === 'STEP') track.setInterpolation(THREE.InterpolateDiscrete);
        tracks.push(track);
      });
      return new THREE.AnimationClip(a.name || 'clip', undefined, tracks);
    });

    return { scene: scene, animations: clips };
  }

  // Load from URL; falls back to the embedded base64 copy (file:// support)
  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).catch(function () {
      if (!window.SOLDIER_GLB_BASE64) throw new Error('GLB fetch failed and no embedded copy');
      var bin = atob(window.SOLDIER_GLB_BASE64);
      var buf = new ArrayBuffer(bin.length);
      var u8 = new Uint8Array(buf);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return buf;
    }).then(parse);
  }

  // Decode the embedded gzip+base64 copy of the GLB
  function embeddedBuffer() {
    if (!window.SOLDIER_GLB_GZ_B64) return Promise.reject(new Error('no embedded copy'));
    if (typeof DecompressionStream === 'undefined')
      return Promise.reject(new Error('gzip decompression not supported'));
    var bin = atob(window.SOLDIER_GLB_GZ_B64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var ds = new DecompressionStream('gzip');
    var writer = ds.writable.getWriter();
    writer.write(u8);
    writer.close();
    var reader = ds.readable.getReader();
    var chunks = [];
    function pump() {
      return reader.read().then(function (res) {
        if (res.done) {
          var total = 0, i;
          for (i = 0; i < chunks.length; i++) total += chunks[i].length;
          var out = new Uint8Array(total), o = 0;
          for (i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
          return out.buffer;
        }
        chunks.push(res.value);
        return pump();
      });
    }
    return pump();
  }

  // Fetch the raw GLB bytes (for per-actor parsing); falls back to embedded copy
  function loadBuffer(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).catch(embeddedBuffer);
  }

  return { parse: parse, load: load, loadBuffer: loadBuffer };
})();
