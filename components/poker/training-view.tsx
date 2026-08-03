"use client";

import {
  Brain,
  Check,
  ChevronRight,
  Gauge,
  HeartPulse,
  Lightbulb,
  Spade,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppData } from "@/lib/app-state";
import {
  adaptiveTrainingQuestions,
  recommendedTrainingFocus,
} from "@/lib/training/curriculum";
import { createEmptyTrainingProgress } from "@/lib/training/progress";
import { loadTrainingProgress } from "@/lib/training/storage";
import { RangeChart } from "@/components/poker/range-chart";

export function TrainingView({
  data,
  updateData,
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
}) {
  const [practiceProgress, setPracticeProgress] = useState(
    createEmptyTrainingProgress,
  );
  const questions = useMemo(
    () => adaptiveTrainingQuestions(practiceProgress),
    [practiceProgress],
  );
  const focus = useMemo(
    () => recommendedTrainingFocus(practiceProgress),
    [practiceProgress],
  );
  const [questionIndex, setQuestionIndex] = useState(
    data.trainingAnswered % questions.length,
  );
  const [answer, setAnswer] = useState<number | null>(null);
  const question = questions[questionIndex % questions.length];
  const accuracy = data.trainingAnswered
    ? Math.round((data.trainingCorrect / data.trainingAnswered) * 100)
    : 0;

  useEffect(() => {
    const refreshProgress = () => setPracticeProgress(loadTrainingProgress());
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshProgress();
    };
    refreshProgress();
    window.addEventListener("storage", refreshProgress);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("storage", refreshProgress);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const chooseAnswer = (index: number) => {
    if (answer !== null) return;
    setAnswer(index);
    updateData((current) => ({
      ...current,
      trainingAnswered: current.trainingAnswered + 1,
      trainingCorrect:
        current.trainingCorrect + (index === question.correct ? 1 : 0),
    }));
  };

  const nextQuestion = () => {
    setQuestionIndex((current) => (current + 1) % questions.length);
    setAnswer(null);
  };

  return (
    <section className="contentPage trainingPage pageEnter">
      <div className="pageHeading">
        <div>
          <span className="eyebrow gold"><Brain size={16} /> Treinador pessoal</span>
          <h1>Pratique decisões, não decore respostas.</h1>
          <p>Exercícios curtos baseados nos conceitos que mais ganham fichas.</p>
        </div>
        <div className="scoreRing" style={{ "--score": `${accuracy}%` } as CSSProperties}>
          <span><strong>{accuracy}%</strong><small>acertos</small></span>
        </div>
      </div>

      <div className="trainingGrid">
        <article className="quizCard surfaceCard">
          <div className="quizTop">
            <span className="eyebrow">{question.eyebrow} · {focus.streetLabel}</span>
            <span>Questão {(questionIndex % questions.length) + 1}/{questions.length}</span>
          </div>
          <h2>{question.question}</h2>
          <div className="quizOptions">
            {question.options.map((option, index) => {
              const revealed = answer !== null;
              const correct = index === question.correct;
              const selected = index === answer;
              return (
                <button
                  type="button"
                  key={option}
                  className={`${selected ? "selected" : ""} ${
                    revealed && correct ? "correct" : ""
                  } ${revealed && selected && !correct ? "wrong" : ""}`}
                  onClick={() => chooseAnswer(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  {option}
                  {revealed && correct && <Check size={18} />}
                  {revealed && selected && !correct && <X size={18} />}
                </button>
              );
            })}
          </div>
          {answer !== null && (
            <div className="quizFeedback">
              <Lightbulb size={21} />
              <div>
                <strong>{answer === question.correct ? "Boa decisão." : "Quase lá."}</strong>
                <p>{question.explanation}</p>
              </div>
            </div>
          )}
          <button type="button" className="primaryButton" disabled={answer === null} onClick={nextQuestion}>
            Próxima situação <ChevronRight size={18} />
          </button>
        </article>

        <aside className="lessonStack">
          <a className="lessonCard trainingPlayCard" href="/treino">
            <span className="lessonIcon"><Users size={21} /></span>
            <div>
              <small>Recomendado · {focus.streetLabel}</small>
              <h3>{focus.title}</h3>
              <p>{focus.description} O professor ajusta a mesa automaticamente.</p>
            </div>
            <ChevronRight size={21} />
          </a>
          <article className="lessonCard preflop">
            <span className="lessonIcon"><Spade size={21} /></span>
            <div><small>Trilha 01 · 6 min</small><h3>Seleção de mãos pré-flop</h3><p>Saiba quando entrar, aumentar ou abandonar pela posição.</p></div>
            <ChevronRight size={21} />
          </article>
          <article className="lessonCard math">
            <span className="lessonIcon"><Gauge size={21} /></span>
            <div><small>Trilha 02 · 8 min</small><h3>Outs, equidade e pot odds</h3><p>Transforme probabilidades em decisões simples.</p></div>
            <ChevronRight size={21} />
          </article>
          <article className="lessonCard mindset">
            <span className="lessonIcon"><HeartPulse size={21} /></span>
            <div><small>Trilha 03 · 4 min</small><h3>Disciplina contra o tilt</h3><p>Reconheça quando a emoção começa a decidir por você.</p></div>
            <ChevronRight size={21} />
          </article>
        </aside>
      </div>
      <RangeChart />
    </section>
  );
}
