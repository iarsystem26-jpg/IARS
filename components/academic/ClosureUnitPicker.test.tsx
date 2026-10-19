import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import ClosureUnitPicker from './ClosureUnitPicker';
import { changeField } from '../../tests/ui-select';
import { SchoolNode } from '../../types';
afterEach(cleanup);
const roots: SchoolNode[]=[{id:'campus',name:'Main campus',type:'campus',children:[{id:'department',name:'College',type:'department',children:[{id:'section',name:'Section A',type:'section',children:[]}]}]}];
function Fixture(){const [ids,setIds]=useState<string[]>([]);return <ClosureUnitPicker roots={roots} selected={ids} onChange={setIds}/>;}
describe('Closure academic path selection',()=>{
 it('uses cascading enrollment-style choices, adds a section, and removes it',async()=>{
  render(<Fixture/>); expect(screen.getByRole('button',{name:'Add academic unit'})).toBeDisabled();
  await changeField('Campus','campus'); await changeField('Department','department'); await changeField('Section','section');
  fireEvent.click(screen.getByRole('button',{name:'Add academic unit'})); expect(screen.getByLabelText('Added academic units')).toHaveTextContent('Main campus / College / Section A');
  fireEvent.click(screen.getByRole('button',{name:'Remove Main campus / College / Section A'})); expect(screen.getByLabelText('Added academic units')).not.toHaveTextContent('Section A');
 });
 it('allows an entire parent unit and prevents duplicate descendants',async()=>{
  render(<Fixture/>); await changeField('Campus','campus'); fireEvent.click(screen.getByRole('button',{name:'Add academic unit'}));
  await changeField('Campus','campus'); await changeField('Department','department');
  expect(screen.getByRole('button',{name:'Add academic unit'})).toBeDisabled();
 });
});
