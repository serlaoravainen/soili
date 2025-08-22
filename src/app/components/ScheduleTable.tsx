"use client";

import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Calendar, Clock, Users, AlertCircle, Lock, Plane, Plus } from 'lucide-react';
import { ShiftType, Employee, DateInfo } from '../types';

interface ScheduleTableProps {
  employees?: Employee[];
}

const ScheduleTable: React.FC<ScheduleTableProps> = ({ employees: externalEmployees }) => {
  const [selectedCell, setSelectedCell] = useState<{ employee: string; day: number } | null>(null);

  const dates: DateInfo[] = [
    { day: 'MA', date: '18.8' },
    { day: 'TI', date: '19.8' },
    { day: 'KE', date: '20.8' },
    { day: 'TO', date: '21.8' },
    { day: 'PE', date: '22.8' },
    { day: 'LA', date: '23.8' },
    { day: 'SU', date: '24.8' },
    { day: 'MA', date: '25.8' },
    { day: 'TI', date: '26.8' },
    { day: 'KE', date: '27.8' }
  ];

  const defaultEmployees: Employee[] = [
    {
      id: '1',
      name: 'Maija',
      email: 'maija@company.com',
      department: 'Myynti',
      isActive: true,
      shifts: [
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' }
      ]
    },
    {
      id: '2',
      name: 'Pekka',
      email: 'pekka@company.com',
      department: 'IT',
      isActive: true,
      shifts: [
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' }
      ]
    },
    {
      id: '3',
      name: 'Liisa',
      email: 'liisa@company.com',
      department: 'HR',
      isActive: true,
      shifts: [
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' }
      ]
    },
    {
      id: '4',
      name: 'Janne',
      email: 'janne@company.com',
      department: 'Tuotanto',
      isActive: true,
      shifts: [
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'normal', hours: 8 },
        { type: 'normal', hours: 8 }
      ]
    },
    {
      id: '5',
      name: 'Sanna',
      email: 'sanna@company.com',
      department: 'Myynti',
      isActive: true,
      shifts: [
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' },
        { type: 'empty' }
      ]
    }
  ];

  const employees = externalEmployees || defaultEmployees;
  const activeEmployees = employees.filter(emp => emp.isActive);

  const getShiftDisplay = (shift: ShiftType) => {
    switch (shift.type) {
      case 'normal':
        return { content: `${shift.hours}h`, color: 'bg-primary text-primary-foreground', icon: <Clock className="w-3 h-3" /> };
      case 'locked':
        return { content: `${shift.hours}h`, color: 'bg-amber-500 text-white', icon: <Lock className="w-3 h-3" /> };
      case 'absent':
        return { content: 'A', color: 'bg-destructive text-destructive-foreground', icon: <AlertCircle className="w-3 h-3" /> };
      case 'holiday':
        return { content: 'H', color: 'bg-blue-500 text-white', icon: <Plane className="w-3 h-3" /> };
      default:
        return { content: '', color: 'bg-muted hover:bg-accent', icon: <Plus className="w-3 h-3 opacity-0 group-hover:opacity-50" /> };
    }
  };

  const getTotalHours = (employee: Employee) => {
    return employee.shifts.reduce((total, shift) => {
      return total + (shift.hours || 0);
    }, 0);
  };

  const handleCellClick = (employeeId: string, dayIndex: number) => {
    setSelectedCell({ employee: employeeId, day: dayIndex });
  };

  return (
    <div className="w-full space-y-6">
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Calendar className="w-6 h-6 text-primary" />
              <CardTitle className="text-2xl text-primary">Vuorot</CardTitle>
            </div>
            <Badge variant="secondary" className="px-3 py-1">
              <Users className="w-4 h-4 mr-2" />
              {activeEmployees.length} työntekijää
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-full">
              {/* Header */}
              <div className="bg-muted/50 border-b">
                <div className="grid grid-cols-11 gap-px">
                  <div className="p-4 bg-background">
                    <span className="text-sm font-medium text-muted-foreground">Työntekijä</span>
                  </div>
                  {dates.map((date, index) => (
                    <div key={index} className="p-3 bg-background text-center">
                      <div className="text-xs font-medium text-muted-foreground">{date.day}</div>
                      <div className="text-sm font-semibold mt-1">{date.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Employee Rows */}
              <div className="divide-y divide-border">
                {activeEmployees.map((employee) => (
                  <div key={employee.id} className="grid grid-cols-11 gap-px hover:bg-accent/30 transition-colors">
                    <div className="p-4 bg-background flex items-center justify-between">
                      <div>
                        <span className="font-medium">{employee.name}</span>
                        <div className="text-xs text-muted-foreground">{employee.department}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {getTotalHours(employee)}h
                      </Badge>
                    </div>
                    {employee.shifts.map((shift, dayIndex) => {
                      const shiftDisplay = getShiftDisplay(shift);
                      const isSelected = selectedCell?.employee === employee.id && selectedCell?.day === dayIndex;
                      
                      return (
                        <TooltipProvider key={dayIndex}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`
                                  h-16 p-2 m-0 rounded-none border-0 group cursor-pointer
                                  flex items-center justify-center
                                  ${shiftDisplay.color}
                                  ${isSelected ? 'ring-2 ring-ring ring-offset-2' : ''}
                                  transition-all duration-200 hover:scale-105 hover:shadow-md
                                `}
                                onClick={() => handleCellClick(employee.id, dayIndex)}
                              >
                                <div className="flex flex-col items-center space-y-1">
                                  {shiftDisplay.icon}
                                  {shiftDisplay.content && (
                                    <span className="text-xs font-medium">{shiftDisplay.content}</span>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{employee.name} - {dates[dayIndex].day} {dates[dayIndex].date}</p>
                              {shift.type === 'normal' && <p>{shift.hours} tuntia</p>}
                              {shift.type === 'empty' && <p>Lisää vuoro</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Summary Row */}
              <div className="bg-accent/50 border-t-2 border-primary/20">
                <div className="grid grid-cols-11 gap-px">
                  <div className="p-4 bg-background">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Yhteensä ({activeEmployees.length} työntekijää)</span>
                    </div>
                  </div>
                  {dates.map((_, dayIndex) => {
                    const dayTotal = activeEmployees.reduce((total, employee) => {
                      const shift = employee.shifts[dayIndex];
                      return total + (shift?.hours || 0);
                    }, 0);
                    
                    return (
                      <div key={dayIndex} className="p-3 bg-background text-center">
                        <div className="text-sm font-semibold text-primary">{dayTotal}h</div>
                        <div className="text-xs text-muted-foreground">
                          {activeEmployees.filter(emp => emp.shifts[dayIndex]?.type !== 'empty').length} henkilöä
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center justify-center">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
                <Clock className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
              <span className="text-sm">Normaali vuoro</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-amber-500 rounded-sm flex items-center justify-center">
                <Lock className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-sm">Lukittu vuoro</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-destructive rounded-sm flex items-center justify-center">
                <AlertCircle className="w-2.5 h-2.5 text-destructive-foreground" />
              </div>
              <span className="text-sm">Poissaolo</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
                <Plane className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-sm">Loma</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer Note */}
      <div className="text-center text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
        Vinkki: klikkaa solua pikanapin avaamiseksi (0, 6, 7.5, 8), tupla-klikkaus manuaalinen syöttö, raahaa sama päivä – toisen henkilön.
        🔒 lukitse solun.
      </div>
    </div>
  );
};

export default ScheduleTable;