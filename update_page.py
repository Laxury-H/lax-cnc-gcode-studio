import sys

path = 'd:\\Project\\lax-cnc-gcode-studio\\app\\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    num = i + 1
    # Skip type definitions ViewMode and OrbitCamera
    if num >= 41 and num <= 42: continue
    # Skip getViewMeta
    if num >= 52 and num <= 72: continue
    # Skip pointOnSegment
    if num >= 135 and num <= 154: continue
    # Skip partialPoints
    if num >= 156 and num <= 177: continue
    # Skip formatTime
    if num >= 179 and num <= 188: continue
    # Skip formatLength
    if num >= 190 and num <= 192: continue
    # Skip motionLabel
    if num >= 194 and num <= 202: continue
    # Skip Icon
    if num >= 204 and num <= 391: continue
    # Skip MetricCard
    if num >= 1479 and num <= 1509: continue
    # Skip ToolbarButton
    if num >= 1511 and num <= 1533: continue

    new_lines.append(line)
    
    if num == 40:
        new_lines.append('import { Icon } from "@/core/components/ui/Icon";\n')
        new_lines.append('import { MetricCard } from "@/core/components/ui/MetricCard";\n')
        new_lines.append('import { ToolbarButton } from "@/core/components/ui/ToolbarButton";\n')
        new_lines.append('import { \n  ViewMode, \n  OrbitCamera, \n  getViewMeta, \n  pointOnSegment, \n  partialPoints, \n  formatTime, \n  formatLength, \n  motionLabel \n} from "@/core/utils/gcode-utils";\n')

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
