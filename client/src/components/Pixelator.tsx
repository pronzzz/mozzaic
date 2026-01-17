import React, { useRef, useEffect, useState } from 'react';
import { createShader, createProgram, createTexture, resizeCanvasToDisplaySize } from '../utils/webgl';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
// @ts-ignore
import vertexShaderSource from '../shaders/vertex.glsl?raw';
// @ts-ignore
import fragmentShaderSource from '../shaders/fragment.glsl?raw';

const Pixelator: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
    const [baseAspectRatio, setBaseAspectRatio] = useState<number>(1); // Intrinsic aspect
    const [rotation, setRotation] = useState<number>(0); // 0, 1, 2, 3 (x 90deg)
    const [pixelSize, setPixelSize] = useState<number>(6.0);
    const [colorCount, setColorCount] = useState<number>(16.0);
    const [ditherStrength, setDitherStrength] = useState<number>(0.15);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const ffmpegRef = useRef(new FFmpeg());
    const animationRef = useRef<number | null>(null);

    // Computed effective aspect ratio for the container
    const isSideways = rotation % 2 !== 0; // 90 or 270 degrees
    const displayAspectRatio = isSideways ? (1 / baseAspectRatio) : baseAspectRatio;

    const loadFfmpeg = async () => {
        try {
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
            const ffmpeg = ffmpegRef.current;
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
            setFfmpegLoaded(true);
        } catch (e) {
            console.error("FFmpeg load failed", e);
        }
    };

    useEffect(() => {
        loadFfmpeg();
    }, []);

    useEffect(() => {
        if (ffmpegLoaded) console.log("FFmpeg ready");
    }, [ffmpegLoaded]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Use WebGL 1 for max compatibility
        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.error("WebGL not supported");
            return;
        }

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) return;

        const program = createProgram(gl, vertexShader, fragmentShader);
        if (!program) return;

        gl.useProgram(program);

        const positionAttributeLocation = gl.getAttribLocation(program, "position");
        const textureLocation = gl.getUniformLocation(program, "uTexture");
        const resolutionLocation = gl.getUniformLocation(program, "uResolution");
        const pixelSizeLocation = gl.getUniformLocation(program, "uPixelSize");
        const colorCountLocation = gl.getUniformLocation(program, "uColorCount");
        const ditherStrengthLocation = gl.getUniformLocation(program, "uDitherStrength");
        const rotationLocation = gl.getUniformLocation(program, "uRotation");

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = [
            -1.0, -1.0,
            1.0, -1.0,
            -1.0, 1.0,
            -1.0, 1.0,
            1.0, -1.0,
            1.0, 1.0,
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const texture = createTexture(gl);

        const render = () => {
            resizeCanvasToDisplaySize(canvas);
            gl.viewport(0, 0, canvas.width, canvas.height);

            gl.clearColor(0, 0, 0, 0); // Transparent background
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(program);

            gl.enableVertexAttribArray(positionAttributeLocation);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

            gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

            if (image && texture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            }

            gl.uniform1i(textureLocation, 0);
            gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
            gl.uniform1f(pixelSizeLocation, pixelSize);
            gl.uniform1f(colorCountLocation, colorCount);
            gl.uniform1f(ditherStrengthLocation, ditherStrength);

            // Pass rotation in radians.
            // 90 deg = PI/2.
            // We rotate negatively to match clockwise button click expectation usually (or verify visual).
            gl.uniform1f(rotationLocation, rotation * -Math.PI / 2);

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            animationRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [image, pixelSize, colorCount, ditherStrength, rotation]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);

            setRotation(0); // Reset rotation

            if (file.type.startsWith('video')) {
                const video = document.createElement('video');
                video.src = url;
                video.loop = true;
                video.muted = true;
                video.play();
                video.onloadeddata = () => {
                    setImage(video);
                    setBaseAspectRatio(video.videoWidth / video.videoHeight);
                };
            } else {
                const img = new Image();
                img.src = url;
                img.onload = () => {
                    setImage(img);
                    setBaseAspectRatio(img.naturalWidth / img.naturalHeight);
                };
            }
        }
    };

    const startRecording = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsRecording(true);

        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            setIsRecording(false);
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mozzaic_export_${Date.now()}.webm`;
            a.click();
        };

        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 3000);
    };

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#050505',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>

            {/* Canvas Area (Greedy) */}
            <div style={{
                flex: '1',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                boxSizing: 'border-box',
                minHeight: 0 // Crucial for flex child scrolling/resizing
            }}>
                <div
                    ref={containerRef}
                    style={{
                        width: 'auto',
                        height: 'auto',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        aspectRatio: displayAspectRatio,
                        display: 'flex',
                        boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                        transition: 'aspect-ratio 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
                        position: 'relative'
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            imageRendering: 'pixelated',
                            borderRadius: '8px',
                            objectFit: 'contain'
                        }}
                    />
                </div>
            </div>

            {/* Dock Area (Fixed) */}
            <div style={{
                flex: '0 0 auto',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                paddingBottom: '24px', // Safe area
                zIndex: 100
            }}>
                <div
                    className="glass-panel"
                    style={{
                        width: '92%',
                        maxWidth: '700px',
                        padding: '24px',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px'
                    }}
                >
                    {/* Header / Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="file"
                                    onChange={handleFileChange}
                                    accept="image/*,video/*"
                                    style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                                />
                                <button style={{ pointerEvents: 'none' }}>📂 Open</button>
                            </div>

                            <button onClick={() => setRotation(r => (r + 1) % 4)}>
                                🔄 Rotate
                            </button>
                        </div>

                        <button
                            onClick={startRecording}
                            style={{
                                background: isRecording ? 'rgba(255, 59, 48, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                color: isRecording ? '#ff3b30' : 'white',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            {isRecording ? <>🔴 Rec...</> : <>⚡ Rec 3s</>}
                        </button>
                    </div>

                    {/* Sliders Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', opacity: 0.7 }}>
                                <span>Pixel Size</span><span>{pixelSize.toFixed(0)}px</span>
                            </div>
                            <input type="range" min="1" max="32" value={pixelSize} onChange={(e) => setPixelSize(Number(e.target.value))} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', opacity: 0.7 }}>
                                <span>Palette</span><span>{colorCount}</span>
                            </div>
                            <input type="range" min="2" max="64" value={colorCount} onChange={(e) => setColorCount(Number(e.target.value))} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', opacity: 0.7 }}>
                                <span>Dither</span><span>{(ditherStrength * 100).toFixed(0)}%</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={ditherStrength} onChange={(e) => setDitherStrength(Number(e.target.value))} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Pixelator;
