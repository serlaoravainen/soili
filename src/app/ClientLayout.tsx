"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supaBaseClient";
import EmployeeDashboard from "@/app/components/EmployeeDashboard";
import AdminView from "@/app/components/AdminView";
import Login from "@/app/components/Login";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { Loader } from "lucide-react";
import { Employee, AppSettings, TimePeriod } from "@/app/types";

function EmployeeDashboardWrapper() {
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: employee } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setCurrentEmployee(employee as Employee);

      const { data: all } = await supabase.from("employees").select("*");
      setAllEmployees(all as Employee[]);

      setLoading(false);
    };
    loadData();
  }, []);

  const handleSwitchToAdmin = useCallback(() => {
    window.location.href = "/admin";
  }, []);

  if (loading || !currentEmployee) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <EmployeeDashboard
      currentEmployee={currentEmployee}
      allEmployees={allEmployees}
      onSwitchToAdmin={handleSwitchToAdmin}
    />
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("employees")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setRole(profile?.role ?? null);
      setLoading(false);
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <>
      {role === "admin" ? (
        <AdminView />
      ) : role === "employee" ? (
        <EmployeeDashboardWrapper />
      ) : (
        <Login />
      )}
      <ServiceWorkerRegister />
    </>
  );
}
