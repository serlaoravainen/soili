"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Users, 
  Plus, 
  Edit3, 
  Trash2, 
  Search,
  UserCheck,
  UserX,
  Mail,
  Building
} from 'lucide-react';
import { Employee } from '../types'
import { toast } from 'sonner';

const EmployeeList = () => {
  const [employees, setEmployees] = useState<Employee[]>([
    {
      id: '1',
      name: 'Maija Virtanen',
      email: 'maija.virtanen@company.com',
      department: 'Myynti',
      isActive: true,
      shifts: []
    },
    {
      id: '2', 
      name: 'Pekka Mäkinen',
      email: 'pekka.makinen@company.com',
      department: 'IT',
      isActive: true,
      shifts: []
    },
    {
      id: '3',
      name: 'Liisa Koskinen', 
      email: 'liisa.koskinen@company.com',
      department: 'HR',
      isActive: true,
      shifts: []
    },
    {
      id: '4',
      name: 'Janne Virtala',
      email: 'janne.virtala@company.com', 
      department: 'Tuotanto',
      isActive: false,
      shifts: []
    },
    {
      id: '5',
      name: 'Sanna Laakso',
      email: 'sanna.laakso@company.com',
      department: 'Myynti', 
      isActive: true,
      shifts: []
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    department: '',
    isActive: true
  });

  const filteredEmployees = employees.filter(employee =>
    employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeEmployees = employees.filter(emp => emp.isActive).length;
  const departments = [...new Set(employees.map(emp => emp.department))];

  const handleToggleActive = (employeeId: string) => {
    setEmployees(prev => prev.map(emp => 
      emp.id === employeeId ? { ...emp, isActive: !emp.isActive } : emp
    ));
    const employee = employees.find(emp => emp.id === employeeId);
    toast.success(`${employee?.name} ${employee?.isActive ? 'deaktivoitu' : 'aktivoitu'}`);
  };

  const handleDeleteEmployee = (employeeId: string) => {
    const employee = employees.find(emp => emp.id === employeeId);
    setEmployees(prev => prev.filter(emp => emp.id !== employeeId));
    toast.success(`${employee?.name} poistettu onnistuneesti`);
  };

  const handleAddEmployee = () => {
    if (!newEmployee.name || !newEmployee.email || !newEmployee.department) {
      toast.error('Täytä kaikki pakolliset kentät');
      return;
    }

    const employee: Employee = {
      id: Date.now().toString(),
      name: newEmployee.name,
      email: newEmployee.email,
      department: newEmployee.department,
      isActive: newEmployee.isActive,
      shifts: []
    };

    setEmployees(prev => [...prev, employee]);
    setNewEmployee({ name: '', email: '', department: '', isActive: true });
    setIsAddDialogOpen(false);
    toast.success(`${employee.name} lisätty onnistuneesti`);
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
  };

  const handleUpdateEmployee = () => {
    if (!selectedEmployee) return;

    setEmployees(prev => prev.map(emp => 
      emp.id === selectedEmployee.id ? selectedEmployee : emp
    ));
    setSelectedEmployee(null);
    toast.success('Työntekijätiedot päivitetty');
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-6 h-6 text-primary" />
              <CardTitle className="text-xl text-primary">Työntekijähallinta</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1">
                <UserCheck className="w-4 h-4 mr-2" />
                {activeEmployees} aktiivista
              </Badge>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <div
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer"
                    onClick={() => setIsAddDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Lisää työntekijä
                  </div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Lisää uusi työntekijä</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nimi *</Label>
                      <Input
                        id="name"
                        value={newEmployee.name}
                        onChange={(e) => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Etunimi Sukunimi"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Sähköposti *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newEmployee.email}
                        onChange={(e) => setNewEmployee(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="etunimi.sukunimi@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Osasto *</Label>
                      <Select value={newEmployee.department} onValueChange={(value) => setNewEmployee(prev => ({ ...prev, department: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Valitse osasto" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                          <SelectItem value="Uusi osasto">+ Uusi osasto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="active"
                        checked={newEmployee.isActive}
                        onCheckedChange={(checked) => setNewEmployee(prev => ({ ...prev, isActive: checked }))}
                      />
                      <Label htmlFor="active">Aktiivinen työntekijä</Label>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleAddEmployee} className="flex-1">
                        Lisää työntekijä
                      </Button>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">
                        Peruuta
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Hae työntekijöitä nimellä, sähköpostilla tai osastolla..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Employee List */}
          <div className="space-y-3">
            {filteredEmployees.map((employee) => (
              <div key={employee.id} className="border border-border rounded-lg p-4 bg-background hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className={`${employee.isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {employee.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{employee.name}</h4>
                        {employee.isActive ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            <UserCheck className="w-3 h-3 mr-1" />
                            Aktiivinen
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                            <UserX className="w-3 h-3 mr-1" />
                            Ei-aktiivinen
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <span>{employee.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          <span>{employee.department}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`toggle-${employee.id}`} className="text-sm text-muted-foreground">
                        Aktiivinen
                      </Label>
                      <Switch
                        id={`toggle-${employee.id}`}
                        checked={employee.isActive}
                        onCheckedChange={() => handleToggleActive(employee.id)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditEmployee(employee)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEmployee(employee.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Ei työntekijöitä hakukriteereillä</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Muokkaa työntekijää</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nimi</Label>
                <Input
                  id="edit-name"
                  value={selectedEmployee.name}
                  onChange={(e) => setSelectedEmployee(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Sähköposti</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedEmployee.email}
                  onChange={(e) => setSelectedEmployee(prev => prev ? { ...prev, email: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-department">Osasto</Label>
                <Select 
                  value={selectedEmployee.department} 
                  onValueChange={(value) => setSelectedEmployee(prev => prev ? { ...prev, department: value } : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-active"
                  checked={selectedEmployee.isActive}
                  onCheckedChange={(checked) => setSelectedEmployee(prev => prev ? { ...prev, isActive: checked } : null)}
                />
                <Label htmlFor="edit-active">Aktiivinen työntekijä</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleUpdateEmployee} className="flex-1">
                  Tallenna muutokset
                </Button>
                <Button variant="outline" onClick={() => setSelectedEmployee(null)} className="flex-1">
                  Peruuta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Department Statistics */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Osastotilastot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {departments.map(department => {
              const deptEmployees = employees.filter(emp => emp.department === department);
              const activeDeptEmployees = deptEmployees.filter(emp => emp.isActive);
              
              return (
                <div key={department} className="text-center p-3 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">{department}</h4>
                  <div className="text-2xl font-bold text-primary">{activeDeptEmployees.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {deptEmployees.length} yhteensä
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeList;