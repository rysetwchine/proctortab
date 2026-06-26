import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider'; // I-install kung wala pa
import { Plus, X, ShieldCheck } from 'lucide-react';

export const CreateAssessmentPanel = () => {
  const [numQuestions, setNumQuestions] = useState(10);
  
  // Logic para sa dynamic question generation base sa input
  // Sa halip na i-hardcode ang array, i-render base sa numQuestions
  const generateQuestions = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      question: '',
      options: ['', '', '', ''],
      correctAnswer: 0
    }));
  };

  return (
    // Main container na may dark background
    <div className="min-h-screen bg-[#050608] p-8 text-gray-200">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Create Exam</h1>
            <p className="text-gray-400">Configure questions, security, timer, and grading options.</p>
          </div>
        </div>

        {/* Step 2: Question Source (Ang tinanong mo tungkol sa logic) */}
        <Card className="bg-[#0f111a] border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold">2</span>
              <h2 className="text-xl font-semibold">Question Source</h2>
            </div>

            <div className="space-y-6">
              <div>
                <Label>Number of Questions ({numQuestions})</Label>
                <Slider 
                  defaultValue={[10]} 
                  max={30} 
                  min={1} 
                  step={1} 
                  onValueChange={(val) => setNumQuestions(val[0])}
                  className="mt-2"
                />
              </div>

              {/* Dito papasok ang logic: kahit isa lang module, 
                  mag-re-render ang questions base sa numQuestions state */}
              <div className="text-sm text-gray-500 italic">
                Selected: {numQuestions} questions will be generated from uploaded modules.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-6">
          <Button variant="outline" className="border-gray-700 bg-transparent text-white">Save as Draft</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">Create Exam</Button>
        </div>
      </div>
    </div>
  );
};