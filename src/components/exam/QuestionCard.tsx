import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radiogroup';
import { Label } from '@/components/ui/label';
import { Question } from '@/types';

interface QuestionCardProps {
  question: Question;
  selectedAnswer?: string;
  onAnswerChange: (answer: string) => void;
  readOnly?: boolean;
}

export const QuestionCard = ({
  question,
  selectedAnswer,
  onAnswerChange,
  readOnly,
}: QuestionCardProps) => {
  return (
    <Card className="border">
      <CardContent className="p-6 space-y-4">
        <p className="font-bold text-base">
          {question.id}. {question.question}
        </p>
        <RadioGroup
          value={selectedAnswer}
          onValueChange={readOnly ? () => {} : onAnswerChange}
          disabled={readOnly}
          className={readOnly ? 'pointer-events-none opacity-90' : ''}
        >
          <div className="space-y-2">
            {question.options.map((option, idx) => {
              const optionLabel = String.fromCharCode(65 + idx);
              return (
                <div
                  key={idx}
                  className="flex items-center space-x-3 p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer border border-transparent hover:border-primary"
                >
                  <RadioGroupItem value={option} id={`q${question.id}-${idx}`} />
                  <Label
                    htmlFor={`q${question.id}-${idx}`}
                    className="flex-1 cursor-pointer"
                  >
                    {optionLabel}) {option}
                  </Label>
                </div>
              );
            })}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
};
