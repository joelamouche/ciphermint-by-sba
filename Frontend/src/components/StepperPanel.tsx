interface Step {
  id: "connect" | "verify" | "claim" | "transfer";
  title: string;
  description: string;
}

interface StepperPanelProps {
  steps: readonly Step[];
  activeStepId: Step["id"];
}

export function StepperPanel({ steps, activeStepId }: StepperPanelProps) {
  return (
    <section className="card stepper">
      <h2>Progress</h2>
      <ol className="stepper-list">
        {steps.map((step, index) => {
          const activeIndex = steps.findIndex(
            (entry) => entry.id === activeStepId
          );
          const isActive = step.id === activeStepId;
          const isDone = index < activeIndex;
          return (
            <li
              key={step.id}
              className={`step ${isActive ? "active" : ""} ${
                isDone ? "done" : ""
              }`}
            >
              <span className="step-index">{index + 1}</span>
              <div>
                <span className="step-title">{step.title}</span>
                <span className="step-desc">{step.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
