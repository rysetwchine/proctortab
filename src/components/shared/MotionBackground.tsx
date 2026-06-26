import React, { useEffect, useRef } from 'react';

interface MotionBackgroundProps {
  children?: React.ReactNode;
}

export const MotionBackground: React.FC<MotionBackgroundProps> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particlesArray: any[] = [];
    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
      x: number; y: number; size: number; speedX: number; speedY: number;
      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.6;
        this.speedY = (Math.random() - 0.5) * 0.6;
      }
      update() {
        this.x += this.speedX; this.y += this.speedY;
        if (this.x > canvas!.width || this.x < 0) this.speedX = -this.speedX;
        if (this.y > canvas!.height || this.y < 0) this.speedY = -this.speedY;
      }
      draw() {
        ctx!.fillStyle = 'rgba(56, 189, 248, 0.7)';
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    const init = () => {
      particlesArray = [];
      const count = (canvas.width * canvas.height) / 12000;
      for (let i = 0; i < count; i++) particlesArray.push(new Particle());
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesArray.forEach(p => { p.update(); p.draw(); });
      
      for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
          const dx = particlesArray[a].x - particlesArray[b].x;
          const dy = particlesArray[a].y - particlesArray[b].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - dist/120) * 0.4})`;
            ctx.beginPath(); ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
            ctx.lineTo(particlesArray[b].x, particlesArray[b].y); ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    init(); animate();
    return () => { 
      window.removeEventListener('resize', resizeCanvas); 
      cancelAnimationFrame(animationFrameId); 
    };
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden text-slate-200">
      <canvas 
        ref={canvasRef} 
        className="fixed inset-0 z-0 pointer-events-none w-full h-full bg-[#020208]"
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100vw', 
          height: '100vh',
          display: 'block'
        }} 
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};