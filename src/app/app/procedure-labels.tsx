"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  getProcedureLabels,
  type ProcedureLabels,
} from "@/lib/business/procedure-labels";

// Disponibiliza, para as telas de /app, os rótulos de apresentação das ofertas
// (procedimentos x serviços) decididos a partir do tipo de negócio da
// organização. O tipo de negócio vem da carga de /api/organization já feita pelo
// layout — nenhuma consulta adicional é introduzida para trocar um texto.
//
// O valor padrão é o fallback neutro ("Serviço(s)"), usado enquanto a
// organização ainda não foi carregada.
const ProcedureLabelsContext = createContext<ProcedureLabels>(
  getProcedureLabels(null)
);

export function ProcedureLabelsProvider({
  businessType,
  children,
}: {
  businessType?: string | null;
  children: ReactNode;
}) {
  return (
    <ProcedureLabelsContext.Provider value={getProcedureLabels(businessType)}>
      {children}
    </ProcedureLabelsContext.Provider>
  );
}

export function useProcedureLabels(): ProcedureLabels {
  return useContext(ProcedureLabelsContext);
}
