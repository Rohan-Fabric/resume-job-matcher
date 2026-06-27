"use client";

import { useEffect, useRef } from "react";
import AOS from "aos";
import "aos/dist/aos.css";
import { FileText, Target, Sparkles } from "lucide-react";

export function HowItWorks() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      AOS.init({
        duration: 1000,
        easing: "ease-out-cubic",
        once: true,
        offset: 50,
      });
      initialized.current = true;
    }

    return () => {
      if (initialized.current) {
        AOS.refresh();
      }
    };
  }, []);

  const steps = [
    {
      number: "01",
      title: "Upload",
      description: "Drop your PDF resume. Our AI reads it instantly, extracting your skills, experience, and career trajectory.",
      icon: <FileText className="w-7 h-7" />,
      aos: "fade-right",
    },
    {
      number: "02",
      title: "Match",
      description: "We source live roles from across the web and score each match by fit, ranking them by how well they align with your profile.",
      icon: <Target className="w-7 h-7" />,
      aos: "fade-up",
    },
    {
      number: "03",
      title: "Tailor",
      description: "One click rewrites your CV for any job, optimizing keywords and highlighting the most relevant experience for that specific role.",
      icon: <Sparkles className="w-7 h-7" />,
      aos: "fade-left",
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto mt-32 max-w-6xl px-6">
      <div className="text-center mb-16" data-aos="fade-down">
        <h2 className="font-display text-4xl sm:text-5xl text-ink mb-4">
          How it works
        </h2>
        <p className="text-muted text-lg max-w-2xl mx-auto">
          Three simple steps to transform your job search. Each powered by specialized AI agents working together as one team.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {steps.map((step, index) => (
          <div
            key={step.number}
            data-aos={step.aos}
            className="group relative h-full"
          >
            <div className="card-interactive relative h-full rounded-3xl border border-line bg-surface p-8 overflow-hidden flex flex-col">
              {/* Premium gradient accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-brand/5 to-transparent rounded-full blur-2xl group-hover:from-brand/10 transition-all duration-500" />
              
              {/* Number badge */}
              <div className="relative mb-6">
                <span className="font-mono text-5xl font-bold text-brand/20 group-hover:text-brand/30 transition-colors duration-300">
                  {step.number}
                </span>
              </div>

              {/* Icon */}
              <div className="relative mb-5">
                <div className="w-14 h-14 rounded-2xl bg-brand-wash flex items-center justify-center text-brand group-hover:scale-110 transition-transform duration-300">
                  {step.icon}
                </div>
              </div>

              {/* Content */}
              <h3 className="relative font-semibold text-xl text-ink mb-3 group-hover:text-brand transition-colors duration-300">
                {step.title}
              </h3>
              <p className="relative text-sm leading-relaxed text-ink-soft">
                {step.description}
              </p>

              {/* Decorative line */}
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-brand/0 via-brand/20 to-brand/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Connector line for desktop */}
            {index < steps.length - 1 && (
              <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-px bg-line/50" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
