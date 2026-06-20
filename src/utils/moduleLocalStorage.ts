/**
 * Module Local Storage Utility
 * Provides utilities for storing and retrieving modules from localStorage
 * Ensures modules uploaded in ModulesPanel are available in Coursedetails and Assessment dialogs
 */

import type { CourseModule } from '@/context/SessionContext';

const MODULES_STORAGE_KEY = 'proctortab_course_modules';

/**
 * Load all modules from localStorage
 */
export function loadModulesFromLocalStorage(): CourseModule[] {
  try {
    const stored = localStorage.getItem(MODULES_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    console.log(`[ModuleLocalStorage] Loaded ${parsed.length} modules`);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load modules from localStorage:', error);
    return [];
  }
}

/**
 * Save modules to localStorage
 */
export function saveModulesToLocalStorage(modules: CourseModule[]): void {
  try {
    localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modules));
    console.log(`[ModuleLocalStorage] Saved ${modules.length} modules`);
  } catch (error) {
    console.error('Failed to save modules to localStorage:', error);
  }
}

/**
 * Add a single module to localStorage
 */
export function addModuleToLocalStorage(module: CourseModule): void {
  const modules = loadModulesFromLocalStorage();
  const exists = modules.some((m) => m.id === module.id);

  if (!exists) {
    modules.push(module);
    saveModulesToLocalStorage(modules);
    console.log(`[ModuleLocalStorage] Added module: ${module.title}`);
  }
}

/**
 * Update a module in localStorage
 */
export function updateModuleInLocalStorage(module: CourseModule): void {
  const modules = loadModulesFromLocalStorage();
  const index = modules.findIndex((m) => m.id === module.id);

  if (index !== -1) {
    modules[index] = module;
    saveModulesToLocalStorage(modules);
    console.log(`[ModuleLocalStorage] Updated module: ${module.title}`);
  }
}

/**
 * Delete a module from localStorage
 */
export function deleteModuleFromLocalStorage(moduleId: string): void {
  const modules = loadModulesFromLocalStorage();
  const filtered = modules.filter((m) => m.id !== moduleId);

  if (filtered.length < modules.length) {
    saveModulesToLocalStorage(filtered);
    console.log(`[ModuleLocalStorage] Deleted module: ${moduleId}`);
  }
}

/**
 * Clear all modules from localStorage
 */
export function clearModulesFromLocalStorage(): void {
  localStorage.removeItem(MODULES_STORAGE_KEY);
  console.log(`[ModuleLocalStorage] Cleared all modules`);
}
