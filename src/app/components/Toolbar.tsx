"use client";

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { 
  Upload, 
  RefreshCw, 
  Settings, 
  Calendar,
  FileSpreadsheet,
  FileText,
  Wand2,
  Save,
  Undo,
  Redo,
  Filter,
  Search,
  Bell
} from 'lucide-react';
import { toast } from 'sonner';

const Toolbar = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(true);

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    toast.info('Aloitetaan automaattinen vuorojen generointi...');
    
    // Simulate generation process
    setTimeout(() => {
      setIsGenerating(false);
      toast.success('Vuorot generoitu onnistuneesti!');
    }, 3000);
  };

  const handleExportExcel = () => {
    toast.success('Vie Excel-tiedostoon - lataus käynnistyy...');
  };

  const handleExportPDF = () => {
    toast.success('Vie PDF-tiedostoon - lataus käynnistyy...');
  };

  const handleSave = () => {
    toast.success('Muutokset tallennettu onnistuneesti');
    setHasUnsavedChanges(false);
  };

  const handleImport = () => {
    toast.info('Avaa tiedoston valitsin...');
  };

  return (
    <Card className="shadow-md border-0 bg-gradient-to-r from-background to-secondary/10">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Left Section - Main Actions */}
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleAutoGenerate}
              disabled={isGenerating}
              className="bg-primary hover:bg-primary/90"
            >
              {isGenerating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {isGenerating ? 'Generoidaan...' : 'Auto-generointi'}
            </Button>

            <Separator orientation="vertical" className="h-8" />

            <Button
              variant="outline"
              onClick={handleSave}
              className={hasUnsavedChanges ? 'border-amber-500 text-amber-600' : ''}
            >
              <Save className="w-4 h-4 mr-2" />
              Tallenna
              {hasUnsavedChanges && (
                <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700">
                  •
                </Badge>
              )}
            </Button>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm">
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Redo className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Center Section - View Options */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Search className="w-4 h-4 mr-2" />
              Haku
            </Button>
            <Button variant="ghost" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Suodatin
            </Button>
            <Button variant="ghost" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Kalenteri
            </Button>
          </div>

          {/* Right Section - Export/Import */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleImport}>
              <Upload className="w-4 h-4 mr-2" />
              Tuo
            </Button>

            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExportExcel}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExportPDF}
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <Button variant="ghost" size="sm">
              <Bell className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="sm">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Viimeksi tallennettu: 15:32</span>
            <span>•</span>
            <span>5 työntekijää</span>
            <span>•</span>
            <span>Viikko 34/2024</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Automaattinen tallennus: Päällä
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Toolbar;