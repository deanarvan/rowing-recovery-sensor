import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Scale, Info } from 'lucide-react';

const MetricCard = ({ title, value, unit, icon: Icon, description, color }) => (
    <div className="glass-panel p-4 flex flex-col gap-2">
        <div className="flex justify-between items-start">
            <div className={`p-2 rounded-lg bg-${color}-500/10`}>
                <Icon className={`w-5 h-5 text-${color}-400`} />
            </div>
            <span className="text-2xl font-bold font-mono">{value}</span>
        </div>
        <div className="mt-1">
            <p className="text-sm font-medium text-gray-300">{title}</p>
            <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
    </div>
);

const InfoPanel = ({ integral, symmetry, flexion }) => {
    // Interpretations
    let symmetryText = "Excellent Balance";
    if (symmetry < 90) symmetryText = "Slightly Skewed";
    if (symmetry < 70) symmetryText = "Highly Asymmetric";

    let impulseText = "Optimal Power";
    if (flexion < 80) impulseText = "Reduced Work/Stroke";
    if (flexion < 50) impulseText = "Significant Power Loss";

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-4 mt-6 lg:mt-0"
        >
            <MetricCard
                title="Stroke Impulse (Integral)"
                value={Math.round(integral).toLocaleString()}
                unit="N·s"
                icon={Activity}
                color="purple"
                description={`Total work done per stroke. Represents the area under the curve. ${impulseText}.`}
            />

            <MetricCard
                title="Curve Symmetry"
                value={`${Math.round(symmetry)}%`}
                unit="%"
                icon={Scale}
                color="green"
                description={`How balanced the force application is. ${symmetryText}. Limited flexion delays the peak.`}
            />

            <div className="glass-panel p-4 border-l-4 border-sky-400">
                <div className="flex gap-2 items-center mb-2">
                    <Info className="w-4 h-4 text-sky-400" />
                    <h3 className="font-bold text-sm text-gray-200">The Biomechanics</h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                    <strong>Ankle Flexion</strong> is critical for the "Catch" phase.
                    As you recover from Achilles injury, your ability to compress at the catch is limited (low flexion).
                    <br /><br />
                    This forces you to start the drive later, chopping off the front of the curve and reducing total power (Integral).
                    The graph becomes "right-skewed" (low Symmetry) as you compensate with mainly back/hip drive.
                </p>
            </div>
        </motion.div>
    );
};

export default InfoPanel;
