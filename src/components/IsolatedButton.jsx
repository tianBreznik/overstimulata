import { useEffect, useRef } from 'react';

export const IsolatedButton = ({ label, onClick, variant = 'default', title }) => {
  const hostRef = useRef(null);
  const shadowRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    if (!shadowRef.current) {
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: inline-block !important;
          cursor: pointer !important;
        }
        button {
          all: unset;
          cursor: pointer !important;
          position: relative;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 14px !important;
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
          transition: transform 200ms ease !important;
        }
        button::after {
          content: none !important;
        }
        button:hover,
        button:focus-visible {
          box-shadow: none !important;
        }
        .button-inner {
          border-radius: 9px !important;
          padding: 0.13em 0.6em !important;
          background-image: linear-gradient(135deg, rgba(236,236,238,1), rgba(196,196,200,1)) !important;
          box-shadow:
            inset -0.05em -0.05em 0.05em rgba(5,5,5,0.3),
            inset 0 0 0.04em 0.18em rgba(255,255,255,0.26),
            inset 0.024em 0.05em 0.1em rgba(255,255,255,0.98),
            inset 0.12em 0.12em 0.12em rgba(255,255,255,0.28),
            inset -0.07em -0.2em 0.2em 0.08em rgba(5,5,5,0.22) !important;
          transition: box-shadow 220ms ease, transform 200ms ease, background-image 200ms ease !important;
        }
        button:hover .button-inner,
        button:focus-visible .button-inner {
          box-shadow:
            inset 0.055em 0.1em 0.038em rgba(5,5,5,0.66),
            inset -0.018em -0.02em 0.035em rgba(5,5,5,0.44),
            inset 0.15em 0.15em 0.11em rgba(5,5,5,0.38),
            inset 0 0 0.026em 0.28em rgba(255,255,255,0.18) !important;
        }
        button:active .button-inner {
          transform: scale(0.97) !important;
        }
        .button-label {
          display: inline-flex !important;
          position: relative !important;
          z-index: 2 !important;
          font-family: Helvetica, Arial, sans-serif !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          letter-spacing: 0.012em !important;
          color: rgba(30,30,36,0.96) !important;
          text-shadow: 0 0 0.05em rgba(0,0,0,0.14) !important;
          user-select: none !important;
          align-items: center !important;
          justify-content: center !important;
          line-height: 1 !important;
        }
        button:hover .button-label,
        button:focus-visible .button-label {
          transform: scale(0.978) !important;
        }
        button.add .button-inner { background-image: linear-gradient(135deg, rgba(232,240,255,1), rgba(204,216,245,1)) !important; }
        button.del .button-inner { background-image: linear-gradient(135deg, rgba(255,244,245,1), rgba(238,207,212,1)) !important; }
        button.add .button-label { color: rgba(22,68,168,0.95) !important; text-shadow: 0 0 0.05em rgba(22,68,168,0.18) !important; }
        button.del .button-label { color: rgba(168,40,48,0.95) !important; text-shadow: 0 0 0.05em rgba(168,40,48,0.18) !important; }
      `;
      const btn = document.createElement('button');
      btn.className = variant === 'delete' ? 'del' : variant === 'add' ? 'add' : 'edit';
      if (title) btn.title = title;
      
      const inner = document.createElement('div');
      inner.className = 'button-inner';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'button-label';
      labelSpan.textContent = label;
      inner.appendChild(labelSpan);

      btn.appendChild(inner);
      btn.style.setProperty('cursor', 'pointer', 'important');
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick && onClick(e);
      });
      shadowRef.current.appendChild(style);
      shadowRef.current.appendChild(btn);
      
      // Lock ALL font properties inline - prevent ANY changes
      const lockStyles = () => {
        btn.style.setProperty('cursor', 'pointer', 'important');
      };
      
      lockStyles();
      
      // Lock styles on every state change
      ['mouseenter', 'mouseleave', 'focus', 'blur', 'mousedown', 'mouseup', 'click'].forEach(evt => {
        btn.addEventListener(evt, lockStyles, true);
      });
      
      // MutationObserver to prevent style changes
      const observer = new MutationObserver(() => {
        lockStyles();
      });
      observer.observe(btn, { attributes: true, attributeFilter: ['style', 'class'] });
    } else {
      const btn = shadowRef.current.querySelector('button');
      if (btn) {
        btn.className = variant === 'delete' ? 'del' : variant === 'add' ? 'add' : 'edit';
        if (title) btn.title = title;
        const labelSpan = btn.querySelector('.button-label');
        if (labelSpan) {
          labelSpan.textContent = label;
        }
      }
    }
  }, [label, onClick, variant, title]);

  return <span ref={hostRef} />;
};


