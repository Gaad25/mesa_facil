import type { Metadata } from "next";
import TrainingGame from "@/components/training/training-game";

export const metadata: Metadata = {
  title: "Mesa de treino — Mesa Certa",
  description:
    "Pratique Texas Hold'em offline contra bots e aprenda com um professor local.",
};

export default function TrainingGamePage() {
  return <TrainingGame />;
}
