import type { GameStats, PlayerSettings } from '../../types'
import { styles } from '../../pages/Game.styles'

interface ScoreBarProps {
  players: [PlayerSettings, PlayerSettings]
  stats:   GameStats
}

/** Gold-vs-silver tile-share bar shown above the board. */
export default function ScoreBar({ players, stats }: ScoreBarProps) {
  return (
    <div style={styles.statsPanel}>
      <div style={styles.statPlayer}>
        <div style={{ ...styles.statDot, background: players[0].color, boxShadow: `0 0 8px ${players[0].color}` }} />
        <span style={{ ...styles.statName, color: players[0].color }}>{players[0].name}</span>
        <span style={styles.statCount}>{stats.goldTiles}</span>
        <span style={styles.statPct}>{stats.goldPct}%</span>
      </div>
      <div style={styles.progressTrack}>
        <div
          style={{
            height: '100%',
            width: `${stats.goldPct}%`,
            background: `linear-gradient(90deg, ${players[0].color}, ${players[0].color}cc)`,
            borderRadius: '4px 0 0 4px',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${stats.silverPct}%`,
            background: `linear-gradient(90deg, ${players[1].color}cc, ${players[1].color})`,
            borderRadius: '0 4px 4px 0',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <div style={{ ...styles.statPlayer, flexDirection: 'row-reverse' }}>
        <div style={{ ...styles.statDot, background: players[1].color, boxShadow: `0 0 8px ${players[1].color}` }} />
        <span style={{ ...styles.statName, color: players[1].color }}>{players[1].name}</span>
        <span style={styles.statCount}>{stats.silverTiles}</span>
        <span style={styles.statPct}>{stats.silverPct}%</span>
      </div>
    </div>
  )
}
