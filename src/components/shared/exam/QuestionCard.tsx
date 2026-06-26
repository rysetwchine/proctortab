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
    <div className="bg-[#020208]/30 border border-slate-800/60 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden">
      <div className="p-6 md:p-8 space-y-6">
        <p className="font-bold text-lg md:text-xl text-slate-100 leading-relaxed">
          {question.id}. {question.question}
        </p>
        
        <RadioGroup
          value={selectedAnswer}
          onValueChange={readOnly ? () => {} : onAnswerChange}
          disabled={readOnly}
          className={readOnly ? 'pointer-events-none opacity-85' : ''}
        >
          <div className="space-y-3">
            {question.options.map((option, idx) => {
              const optionLabel = String.fromCharCode(65 + idx);
              const isSelected = selectedAnswer === option;
              
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (!readOnly) onAnswerChange(option);
                  }}
                  className={`flex items-center space-x-3 p-4 rounded-xl transition-all duration-300 cursor-pointer border ${
                    isSelected 
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.12)]' 
                      : 'bg-[#020208]/60 border border-slate-800/40 hover:bg-slate-900/40 hover:border-cyan-500/30 text-slate-300'
                  }`}
                >
                  <RadioGroupItem 
                    value={option} 
                    id={`q${question.id}-${idx}`}
                    className="border-slate-600 text-cyan-400 data-[state=checked]:border-cyan-400 data-[state=checked]:bg-cyan-400" 
                  />
                  <Label
                    htmlFor={`q${question.id}-${idx}`}
                    className="flex-1 cursor-pointer text-sm md:text-base font-medium select-none"
                    onClick={(e) => e.stopPropagation()} // Let outer div click handle selection
                  >
                    <span className="text-cyan-400 font-bold mr-2">{optionLabel}.</span> {option}
                  </Label>
                </div>
              );
            })}
          </div>
        </RadioGroup>
      </div>
    </div>
  );
};
