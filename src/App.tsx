import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Float,
  PerspectiveCamera,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { easing } from "maath";

// ==========================================
// 1. 数学与工具算法 (Math & Utils)
// ==========================================

// 更自然的树形算法：基于黄金角度的叶序排列 (Phyllotaxis)
const getPhyllotaxisPosition = (
  index: number,
  total: number,
  maxRadius: number,
  heightScale: number
) => {
  const angle = index * 137.5 * (Math.PI / 180); // 黄金角度
  const normalizedHeight = index / total; // 0 到 1
  // 半径随高度向上递减，形成圆锥，并加入一点随机扰动让它不那么完美
  const currentRadius =
    maxRadius * (1 - normalizedHeight) * (0.8 + Math.random() * 0.4);

  const x = Math.cos(angle) * currentRadius;
  const z = Math.sin(angle) * currentRadius;
  // 将高度分布在 -heightScale/2 到 heightScale/2 之间
  const y = normalizedHeight * heightScale - heightScale / 2;

  return new THREE.Vector3(x, y, z);
};

// 球体随机分布
const randomVectorInSphere = (radius: number) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
};

type BaseParticleData = {
  treePos: THREE.Vector3;
  scatterPos: THREE.Vector3;
  speed: number;
  rotationOffset: number;
};

// ==========================================
// 2. 组件：针叶粒子系统 (InstancedMesh)
// ==========================================
const NeedleParticles = ({
  mode,
  count = 5000,
}: {
  mode: string;
  count?: number;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // 生成静态数据
  const data = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      // 使用新的叶序算法
      treePos: getPhyllotaxisPosition(i, count, 4.5, 10),
      scatterPos: randomVectorInSphere(18), // 散落范围更大，营造空灵感
      speed: Math.random() * 0.2 + 0.1, // 速度慢一点，更宁静
      rotationOffset: Math.random() * Math.PI,
      scale: Math.random() * 0.6 + 0.4,
    }));
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const targetT = mode === "TREE_SHAPE" ? 1 : 0;

    data.forEach((particle, i) => {
      // 使用阻尼动画平滑过渡当前位置
      dummy.position.x = THREE.MathUtils.damp(
        dummy.position.x,
        THREE.MathUtils.lerp(
          particle.scatterPos.x,
          particle.treePos.x,
          targetT
        ),
        1.5,
        delta
      );
      dummy.position.y = THREE.MathUtils.damp(
        dummy.position.y,
        THREE.MathUtils.lerp(
          particle.scatterPos.y,
          particle.treePos.y,
          targetT
        ),
        1.5,
        delta
      );
      dummy.position.z = THREE.MathUtils.damp(
        dummy.position.z,
        THREE.MathUtils.lerp(
          particle.scatterPos.z,
          particle.treePos.z,
          targetT
        ),
        1.5,
        delta
      );

      // 添加非常缓慢的自身漂浮和旋转
      const time = state.clock.elapsedTime;
      dummy.rotation.set(
        Math.sin(time * particle.speed * 0.5 + particle.rotationOffset) * 0.2,
        time * particle.speed + particle.rotationOffset,
        Math.cos(time * particle.speed * 0.5 + particle.rotationOffset) * 0.2
      );
      dummy.scale.setScalar(particle.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      {/* 使用更细长的几何体模拟松针 */}
      <coneGeometry args={[0.04, 0.3, 4]} />
      <meshStandardMaterial
        color="#002419" // 深森林绿
        emissive="#001409"
        roughness={0.8}
        metalness={0.2}
      />
    </instancedMesh>
  );
};

// ==========================================
// 3. 组件：单个照片粒子 (Individual Photo)
// ==========================================
const PhotoParticle = ({
  mode,
  url,
  index,
  total,
}: {
  mode: string;
  url: string;
  index: number;
  total: number;
}) => {
  const ref = useRef<THREE.Mesh>(null!);
  const texture = useLoader(THREE.TextureLoader, url);

  // 为照片预计算位置。为了不被针叶遮挡，照片分布在树的较外层。
  const data = useMemo<BaseParticleData>(
    () => ({
      // 在叶序基础上增加半径乘数，让照片浮在表面
      treePos: getPhyllotaxisPosition(index, total, 5.5, 11).add(
        new THREE.Vector3(0, 0.5, 0)
      ),
      scatterPos: randomVectorInSphere(20), // 散得更远
      speed: Math.random() * 0.1 + 0.05, // 照片飘得更慢
      rotationOffset: Math.random() * Math.PI,
    }),
    [index, total]
  );

  useFrame((state, delta) => {
    if (!ref.current) return;
    const targetT = mode === "TREE_SHAPE" ? 1 : 0;

    // 位置阻尼
    ref.current.position.x = THREE.MathUtils.damp(
      ref.current.position.x,
      THREE.MathUtils.lerp(data.scatterPos.x, data.treePos.x, targetT),
      1.2,
      delta
    );
    ref.current.position.y = THREE.MathUtils.damp(
      ref.current.position.y,
      THREE.MathUtils.lerp(data.scatterPos.y, data.treePos.y, targetT),
      1.2,
      delta
    );
    ref.current.position.z = THREE.MathUtils.damp(
      ref.current.position.z,
      THREE.MathUtils.lerp(data.scatterPos.z, data.treePos.z, targetT),
      1.2,
      delta
    );

    // 始终面向相机，但带有轻微的漂浮旋转
    ref.current.lookAt(state.camera.position);
    ref.current.rotateZ(
      Math.sin(state.clock.elapsedTime * data.speed + data.rotationOffset) * 0.1
    );
  });

  return (
    <mesh ref={ref} scale={[1.2, 1.2, 1.2]}>
      {/* 照片带有金色边框 */}
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        roughness={0.5}
        metalness={0.5}
        emissive="#E6D2B5" // 香槟金自发光
        emissiveIntensity={0.3}
      />
      {/* 边框 Mesh */}
      <mesh position={[0, 0, -0.01]} scale={[1.05, 1.05, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#E6D2B5" metalness={1} roughness={0.2} />
      </mesh>
    </mesh>
  );
};

// ==========================================
// 4. 主应用程序 (App & UI)
// ==========================================
export default function App() {
  const [mode, setMode] = useState<"SCATTERED" | "TREE_SHAPE">("SCATTERED");
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  // 处理图片上传
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newUrls = Array.from(event.target.files).map((file) =>
        URL.createObjectURL(file)
      );
      // 将新图片追加到现有列表
      setImageUrls((prev) => [...prev, ...newUrls]);
      // 上传后自动切换到散落状态查看效果
      setMode("SCATTERED");
    }
  };

  // 清理内存中的 ObjectURL
  useEffect(() => {
    return () => {
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageUrls]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000a08",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* --- UI 界面 --- */}
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          padding: "30px",
          color: "#E6D2B5",
          fontFamily: '"Times New Roman", serif',
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          pointerEvents: "none", // 防止遮挡画布交互
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontWeight: 300,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontSize: "2rem",
            }}
          >
            Serene Noel
          </h1>
          <p
            style={{ margin: "10px 0 0 0", opacity: 0.7, fontStyle: "italic" }}
          >
            A collaborative memory tree.
          </p>
        </div>

        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          {/* 上传按钮 */}
          <label
            style={{
              display: "inline-block",
              padding: "12px 24px",
              border: "1px solid rgba(230, 210, 181, 0.5)",
              color: "#E6D2B5",
              cursor: "pointer",
              transition: "all 0.3s",
              fontSize: "14px",
              letterSpacing: "1px",
              background: "rgba(0,20,15, 0.6)",
              backdropFilter: "blur(5px)",
            }}
          >
            + UPLOAD MEMORIES
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
          </label>

          {/* 状态切换按钮 */}
          <button
            onClick={() =>
              setMode((m) => (m === "SCATTERED" ? "TREE_SHAPE" : "SCATTERED"))
            }
            style={{
              padding: "12px 24px",
              background: "rgba(230, 210, 181, 0.1)",
              border: "none",
              color: "#E6D2B5",
              cursor: "pointer",
              fontSize: "14px",
              letterSpacing: "2px",
              transition: "all 0.5s",
              borderBottom: "1px solid #E6D2B5",
            }}
          >
            {mode === "SCATTERED" ? "GATHER MEMORIES" : "RELEASE TO SKY"}
          </button>

          <p style={{ fontSize: "12px", opacity: 0.5 }}>
            Loaded Photos: {imageUrls.length}
          </p>
        </div>
      </div>

      {/* --- 3D 场景 --- */}
      <Canvas dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 18]} fov={50} />
        <color attach="background" args={["#000a08"]} />
        {/* 柔和的环境雾气 */}
        <fog attach="fog" args={["#000a08", 15, 40]} />

        {/* 灯光系统：更柔和、更温暖 */}
        <ambientLight intensity={0.3} color="#E6D2B5" />
        <spotLight
          position={[10, 20, 10]}
          angle={0.2}
          penumbra={1}
          intensity={8}
          color="#E6D2B5"
          castShadow
        />
        <pointLight position={[-10, -5, -10]} intensity={2} color="#004d3b" />

        {/* 核心内容组 */}
        <group rotation={[0, 0, 0]}>
          {/* 1. 针叶主体 */}
          <NeedleParticles mode={mode} count={6000} />

          {/* 2. 照片粒子：遍历 URL 数组渲染 */}
          {imageUrls.map((url, index) => (
            <PhotoParticle
              key={url + index} // 使用 URL 作为 key 确保唯一性
              mode={mode}
              url={url}
              index={index}
              total={imageUrls.length}
            />
          ))}
        </group>

        {/* 整体缓慢漂浮，增加宁静感 */}
        <Float
          speed={1}
          rotationIntensity={0.1}
          floatIntensity={0.2}
          floatingRange={[-0.2, 0.2]}
        >
          <mesh visible={false} />
        </Float>

        {/* 后期处理：克制而高级的辉光 */}
        <EffectComposer disableNormalPass>
          <Bloom
            luminanceThreshold={0.3} // 降低阈值让深色也有一点微光
            luminanceSmoothing={0.8}
            intensity={0.8} // 降低强度，不要太刺眼
            radius={0.7}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.6} color="#000a08" />
          {/* 添加一点点噪点，增加胶片感/高级感 */}
          <Noise opacity={0.02} />
        </EffectComposer>

        <OrbitControls
          enablePan={false}
          autoRotate={mode === "TREE_SHAPE"}
          autoRotateSpeed={0.3} // 转得更慢
          minDistance={5}
          maxDistance={30}
          minPolarAngle={Math.PI / 3} // 限制视角，防止看穿底部
          maxPolarAngle={Math.PI / 1.8}
        />
        <Environment preset="night" blur={0.8} background={false} />
      </Canvas>
    </div>
  );
}
